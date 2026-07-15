const { app, BrowserWindow, shell, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

// ─── Базовые пути ─────────────────────────────────────────────────────────────
// __dirname здесь = src/scorcher/, поэтому поднимаемся на два уровня до корня
const ROOT         = path.resolve(__dirname, '..', '..');
const ASSETS       = path.join(ROOT, 'assets');
const SRC_SCORCHER = path.join(ROOT, 'src', 'scorcher');

let mainWindow   = null;
let settingsWindow = null;
let isHidden     = false;
let tray         = null;

// ─── Состояние ────────────────────────────────────────────────────────────────
// Конечный автомат подключения DreamSeeker:
//   'IDLE'      — DS не запущен нами, лаунчер виден
//   'LAUNCHING' — мы инициировали запуск (kill старого -> open byond://), ждём появления DS
//   'PLAYING'   — DS подтверждён в процессах, лаунчер скрыт
//
// Переходы:
//   IDLE      --(клик по серверу / авто-таймер)--> LAUNCHING
//   LAUNCHING --(DS найден в tasklist)-------------> PLAYING
//   LAUNCHING --(дедлайн истёк, DS не появился)----> IDLE  (+ показать лаунчер)
//   PLAYING   --(DS исчез из tasklist)--------------> IDLE  (+ показать лаунчер)
const state = {
    volume: 0.5,
    autoServer: '',
    autoTime: '12:00',
    lastScheduledRun: null,
    dsPhase: 'IDLE',
    launchDeadline: 0,
    childSeen: false,  // видели ли дочерний процесс dreamseeker.exe в текущей сессии запуска
    community: 'ru',   // 'ru' = русские порты (1444), 'kz' = английские (выбор сервера ниже)
    scorcherRegion: 'alpha' // актуально только при community==='kz': 'alpha' (1441) или 'beta' (1414)
};

const MONITOR_INTERVAL_MS = 2000;   // как часто опрашиваем tasklist
const LAUNCH_GRACE_MS     = 30000;  // сколько ждём появления DS после запуска

// ─── Проверка обновлений ─────────────────────────────────────────────
// Бэкенд — основной источник версии, GitHub Releases — fallback, если бэкенд недоступен.
// Мягкое уведомление без принудительной блокировки запуска. Версия общая для
// Lifeweb и Scorcher (один RAR для обоих), поэтому логика идентична main.js.
// TODO: заполнить после деплоя бэкенда и публикации репозитория на GitHub.
const BACKEND_URL  = 'https://REPLACE_ME.onrender.com'; // без слэша в конце
const GITHUB_REPO  = 'REPLACE_ME/REPLACE_ME';           // формат owner/repo
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;    // раз в 4 часа

function compareVersions(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0, nb = pb[i] || 0;
        if (na !== nb) return na > nb ? 1 : -1;
    }
    return 0;
}

async function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function checkForUpdates() {
    const currentVersion = app.getVersion();
    let remote = null;

    try {
        const data = await fetchWithTimeout(`${BACKEND_URL}/api/version`, 5000);
        remote = { version: data.version, notes: data.notes, url: data.downloadUrl };
    } catch (e) {
        console.warn('[update] Бэкенд недоступен, пробуем GitHub Releases:', e.message);
    }

    if (!remote) {
        try {
            const data = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, 5000);
            const version = String(data.tag_name || '').replace(/^v/i, '');
            if (version) remote = { version, notes: data.body || '', url: data.html_url };
        } catch (e) {
            console.warn('[update] GitHub Releases тоже недоступен:', e.message);
        }
    }

    if (!remote || !remote.version) return;

    if (compareVersions(remote.version, currentVersion) > 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', remote);
    }
}

// ─── Настройки ────────────────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'scorcher-settings.json');

function loadSettingsFromDisk() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (typeof data.volume     === 'number') state.volume     = data.volume;
            if (typeof data.autoServer === 'string') state.autoServer = data.autoServer;
            if (typeof data.autoTime   === 'string') state.autoTime   = data.autoTime;
            if (typeof data.community  === 'string') state.community  = data.community;
            if (typeof data.scorcherRegion === 'string') state.scorcherRegion = data.scorcherRegion;
        }
    } catch (e) { console.error('Failed to load settings:', e.message); }
}

function saveSettingsToDisk() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify({
            volume:     state.volume,
            autoServer: state.autoServer,
            autoTime:   state.autoTime,
            community:  state.community,
            scorcherRegion: state.scorcherRegion
        }, null, 2), 'utf-8');
    } catch (e) { console.error('Failed to save settings:', e.message); }
}

// ─── Создание ярлыка SCOROBEY на рабочем столе (один раз при первом запуске) ──
function createDesktopShortcut() {
    const flagFile = path.join(app.getPath('userData'), 'scorobey-shortcut-created.flag');
    if (fs.existsSync(flagFile)) return;

    const desktop      = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktop, 'SCOROBEY.lnk');
    const iconPath     = path.join(ASSETS, 'icons', 'SCOROBEY.ico');
    const batPath = path.join(ROOT, 'launchers', 'Scorcher Launcher.bat');

    const tmpPs1 = path.join(app.getPath('temp'), 'create_scorobey_shortcut.ps1');
    const ps1Script = [
        `$ws = New-Object -ComObject WScript.Shell`,
        `$s = $ws.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}')`,
        `$s.TargetPath = '${batPath.replace(/\\/g, '\\\\')}'`,
        `$s.IconLocation = '${iconPath.replace(/\\/g, '\\\\')} ,0'`,
        `$s.Description = 'SCOROBEY - Scorcher Launcher'`,
        `$s.WorkingDirectory = '${ROOT.replace(/\\/g, '\\\\')}'`,
        `$s.Save()`
    ].join('\r\n');

    fs.writeFileSync(tmpPs1, ps1Script, 'utf-8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`, (err) => {
        try { fs.unlinkSync(tmpPs1); } catch (_) {}
        if (!err) fs.writeFileSync(flagFile, '1');
        else console.error('SCOROBEY shortcut creation failed:', err.message);
    });
}

// ─── Статус в renderer ────────────────────────────────────────────────────────
function sendStatus(text) {
    if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('status-update', text);
}

// ─── Трей ─────────────────────────────────────────────────────────────────────
function createTray() {
    tray = new Tray(path.join(ASSETS, 'icons', 'SCOROBEY.ico'));
    tray.setToolTip('Scorcher Launcher');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Show Scorcher', click: () => showLauncher() },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('double-click', () => showLauncher());
}

// ─── Главное окно ─────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        resizable: false,
        autoHideMenuBar: true,
        backgroundColor: '#0d0500',
        frame: true,
        useContentSize: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(ROOT, 'preload.js')
        },
        icon: path.join(ASSETS, 'icons', 'SCOROBEY.ico')
    });

    mainWindow.loadFile(path.join(SRC_SCORCHER, 'scorcher.html'));

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('byond://')) { handleLaunch(url); return { action: 'deny' }; }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (settingsWindow) settingsWindow.close();
        app.quit();
    });
}

// ─── Окно настроек ────────────────────────────────────────────────────────────
function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }

    const b = mainWindow.getBounds();
    settingsWindow = new BrowserWindow({
        width: 400,
        height: 300,
        x: b.x - 420,
        y: b.y + 200,
        resizable: false,
        autoHideMenuBar: true,
        backgroundColor: '#0a0400',
        frame: true,
        parent: mainWindow,
        useContentSize: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(ROOT, 'preload.js')
        },
        icon: path.join(ASSETS, 'icons', 'SCOROBEY.ico')
    });

    settingsWindow.loadFile(path.join(SRC_SCORCHER, 'scorcher_settings.html'));
    settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── Проверка наличия живого DreamSeeker ───────────────────────────────────────
function isDreamSeekerRunning() {
    return new Promise((resolve) => {
        const cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object {$_.Name -eq \'dreamseeker.exe\'} | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress"';
        exec(cmd, (err, stdout) => {
            if (err || !stdout || !stdout.trim()) { resolve({ running: false, hasChild: false }); return; }
            try {
                let parsed = JSON.parse(stdout);
                if (!Array.isArray(parsed)) parsed = [parsed];
                const pids = new Set(parsed.map(p => p.ProcessId));
                const hasChild = parsed.some(p => pids.has(p.ParentProcessId));
                resolve({ running: parsed.length > 0, hasChild });
            } catch (e) {
                resolve({ running: false, hasChild: false });
            }
        });
    });
}

// ─── Убить все процессы DreamSeeker (ждём завершения) ──────────────────────────
function killDreamSeeker() {
    return new Promise((resolve) => {
        exec('taskkill /F /IM dreamseeker.exe /T', () => {
            // taskkill возвращает ошибку, если процесс не найден — это нормальный случай, не баг.
            resolve();
        });
    });
}

// ─── Скрыть / показать лаунчер ────────────────────────────────────────────────
function hideLauncher() {
    if (mainWindow && !mainWindow.isDestroyed() && !isHidden) {
        mainWindow.webContents.send('prepare-to-hide');
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.hide();
        mainWindow.hide();
        isHidden = true;
    }
}

function showLauncher() {
    if (mainWindow && !mainWindow.isDestroyed() && isHidden) {
        mainWindow.show();
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.show();
        isHidden = false;
        mainWindow.webContents.send('window-restored', state.volume);
        sendStatus('');
    }
}

// ─── Запуск DS ────────────────────────────────────────────────────────────────
// Единственная точка входа для любого запуска (ручной и авто).
// Последовательность СТРОГО такая, как требуется:
//   1. Убить все процессы dreamseeker.exe и дождаться завершения
//   2. Открыть byond:// ссылку (DreamSeeker запускается сам)
//   3. Скрыть лаунчер
//   4. Дальше processMonitorTask следит за появлением/исчезновением процесса
async function launchDreamSeeker(url, statusText) {
    if (state.dsPhase === 'LAUNCHING') return; // уже идёт запуск — игнорируем повторный клик

    state.dsPhase = 'LAUNCHING';
    state.launchDeadline = Date.now() + LAUNCH_GRACE_MS;
    state.childSeen = false; // новая сессия запуска — сбрасываем флаг
    sendStatus(statusText || 'CONNECTING...');

    await killDreamSeeker();
    shell.openExternal(url);
    hideLauncher();
}

function handleLaunch(url)     { launchDreamSeeker(url, 'CONNECTING...'); }
function handleAutoLaunch(url) { launchDreamSeeker(url, 'AUTO-CONNECTING...'); }

// ─── Мониторинг процессов (конечный автомат) ──────────────────────────────────
async function processMonitorTask() {
    const { running, hasChild } = await isDreamSeekerRunning();

    switch (state.dsPhase) {
        case 'IDLE':
            // Ничего не делаем. Лаунчер должен быть виден в этом состоянии;
            // подстраховка на случай рассинхрона isHidden/dsPhase.
            if (isHidden) showLauncher();
            break;

        case 'LAUNCHING':
            if (running) {
                state.dsPhase = 'PLAYING';
                if (hasChild) state.childSeen = true;
                sendStatus('');
            } else if (Date.now() > state.launchDeadline) {
                // DS не поднялся за отведённое время — считаем провалом запуска
                state.dsPhase = 'IDLE';
                showLauncher();
            }
            break;

        case 'PLAYING':
            if (!running) {
                // Процессов вообще не осталось — игра закрылась штатно
                state.dsPhase = 'IDLE';
                showLauncher();
            } else if (hasChild) {
                // Реальный геймплей подтверждён (дочерний процесс есть)
                state.childSeen = true;
            } else if (state.childSeen) {
                // Дочерний процесс был, а теперь пропал, хотя dreamseeker.exe ещё в списке —
                // это зомби (пустая оболочка после закрытия игры). Добиваем и возвращаем лаунчер.
                await killDreamSeeker();
                state.dsPhase = 'IDLE';
                showLauncher();
            }
            // если dreamseeker.exe есть, дочернего процесса нет, и childSeen ещё не было —
            // это загрузочное окно, просто ждём дальше
            break;
    }
}

// ─── Авто-подключение ─────────────────────────────────────────────────────────
async function timeBasedAutoConnectTask() {
    if (!state.autoServer || isHidden || state.dsPhase !== 'IDLE') return;
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (t === state.autoTime && state.lastScheduledRun !== t) {
        state.lastScheduledRun = t;
        const { running } = await isDreamSeekerRunning();
        if (running) return; // DS уже запущен — не мешаем
        handleAutoLaunch(state.autoServer);
    }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('save-settings', (event, settings) => {
    Object.assign(state, settings);
    saveSettingsToDisk();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-info-update', { server: state.autoServer, time: state.autoTime });
        mainWindow.webContents.send('servers-config-update', { community: state.community, scorcherRegion: state.scorcherRegion });
    }
});

ipcMain.handle('get-settings', () => ({
    volume:     state.volume,
    autoServer: state.autoServer,
    autoTime:   state.autoTime,
    community:  state.community,
    scorcherRegion: state.scorcherRegion
}));

ipcMain.on('open-settings', createSettingsWindow);
ipcMain.on('open-external-url', (event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on('set-volume',    (e, v) => { state.volume = v; if (mainWindow) mainWindow.webContents.send('update-volume', v); });
ipcMain.on('hide-window',   () => hideLauncher());
ipcMain.on('launch-server', (e, url) => handleLaunch(url));
ipcMain.handle('get-auto-info', () => state.autoServer ? { server: state.autoServer, time: state.autoTime } : null);

// ─── Старт ────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    loadSettingsFromDisk();
    createWindow();
    createTray();
    createDesktopShortcut();
    setInterval(processMonitorTask,       MONITOR_INTERVAL_MS);
    setInterval(timeBasedAutoConnectTask, 10000);
    setInterval(checkForUpdates,          UPDATE_CHECK_INTERVAL_MS);
    checkForUpdates();

    mainWindow.webContents.on('did-finish-load', () => {
        if (state.autoServer)
            mainWindow.webContents.send('auto-info-update', { server: state.autoServer, time: state.autoTime });
        mainWindow.webContents.send('servers-config-update', { community: state.community, scorcherRegion: state.scorcherRegion });
    });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
