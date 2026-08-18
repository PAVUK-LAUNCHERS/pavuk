const { app, BrowserWindow, shell, ipcMain, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const { isDreamSeekerRunning, killDreamSeeker, stopMonitor } = require('../shared/dsProcessMonitor');

// chrome://gpu показал GPU0=AMD (встроенная, *ACTIVE*), GPU1=NVIDIA (дискретная, не активна) —
// Chromium по умолчанию выбрал более слабую встроенную графику на гибридной системе. Effect должен
// быть вызван до создания app/window, иначе не подхватится.
app.commandLine.appendSwitch('force_high_performance_gpu');

// ─── Базовые пути ─────────────────────────────────────────────────────────────
const ROOT         = path.resolve(__dirname, '..', '..');
const ASSETS       = path.join(ROOT, 'assets');
const SRC_SCORCHER = path.join(ROOT, 'src', 'scorcher');

let mainWindow   = null;
let settingsWindow = null;
let isHidden     = false;
let tray         = null;

// ─── Состояние ────────────────────────────────────────────────────────────────
const state = {
    volume: 0.5,
    autoServer: '',
    autoTime: '12:00',
    lastScheduledRun: null,
    dsPhase: 'IDLE',
    launchDeadline: 0,
    childSeen: false,
    community: 'ru',
    scorcherRegion: 'alpha',
    exitHotkey: 'Alt+F4'
};

const MONITOR_INTERVAL_MS = 2000;
const LAUNCH_GRACE_MS     = 30000;

// ─── Размер игровой области и нахлёст тайтлбара (окно "выпирает" из-под своей границы) ───
// Windows всегда клипует/сглаживает контент строго по границе прямоугольника окна —
// поэтому чтобы тайтлбар реально торчал выше обычного края, окно делается на OVERHANG_PX
// выше игрового контента и делается прозрачным (transparent:true), а хитбокс обрезается setShape()
// под реальный силуэт спрайта в этой полосе — см. computeTitlebarOverhangRects() ниже.
const GAME_WIDTH   = 900;
const GAME_HEIGHT  = 700;
const OVERHANG_PX  = 10; // сколько пикселей ВЕРХА TASKBAR.png (900x50) торчит выше игрового прямоугольника —
                          // строки 0–9 сплошного силуэта нет (только гем-ниша слева и скруглённый правый торец),
                          // с 10-й строки спрайт уже полностью сплошной на всю ширину (проверено по альфе).
                          // Значение не менялось при переходе спрайта с 900x40 на 900x50 — вырос только сам бар.
                          //
                          // НИЗ спрайта (строки ~41–49) тоже выступает за пределы сплошного бара (тот же гем
                          // теперь торчит и снизу) — но это НЕ требует отдельного OVERHANG/setShape-рассчёта,
                          // т.к. окно и так продолжается далеко вниз до игрового поля (700px) — нижний выступ
                          // целиком попадает в уже существующий блок-прямоугольник #game-area и просто рисуется
                          // поверх него по z-index. Спец-обработка через computeTitlebarOverhangRects() нужна
                          // только там, где спрайт торчит ЗА ПРЕДЕЛЫ окна (сверху, y<0 в системе координат окна).

const BACKEND_URL  = 'https://roleplay-n-hookah.vercel.app';
const GITHUB_REPO  = 'PAVUK-LAUNCHERS/pavuk';
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// app.getVersion() возвращает версию Electron runtime, а не проекта, когда приложение
// запущено не через electron-builder/asar (наш случай — PAVUK_RELEASE с голым Electron +
// сырым main.js). Читаем версию напрямую из корневого package.json (общего для обоих лаунчеров).
let APP_VERSION = '0.0.0';
try {
    APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version || APP_VERSION;
} catch (e) {
    console.error('Failed to read version from package.json:', e.message);
}

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
    const currentVersion = APP_VERSION;
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
            if (typeof data.exitHotkey === 'string') state.exitHotkey = data.exitHotkey;
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
            scorcherRegion: state.scorcherRegion,
            exitHotkey: state.exitHotkey
        }, null, 2), 'utf-8');
    } catch (e) { console.error('Failed to save settings:', e.message); }
}

// ─── Горячая клавиша выхода из игры (глобальная, работает даже без фокуса на окне) ───
function registerExitHotkey() {
    try { globalShortcut.unregisterAll(); } catch (e) {}
    if (!state.exitHotkey) return;
    try {
        const ok = globalShortcut.register(state.exitHotkey, () => {
            killDreamSeeker();
        });
        if (!ok) console.error('[hotkey] Не удалось зарегистрировать горячую клавишу:', state.exitHotkey, '(возможно занята другим приложением/вторым лаунчером)');
    } catch (e) {
        console.error('[hotkey] Некорректный accelerator:', state.exitHotkey, e.message);
    }
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

// ─── Хитбокс окна: обрезка под силуэт тайтлбара в зоне нахлёста ────────────────
// Окно теперь на OVERHANG_PX выше игрового контента и прозрачно — без setShape клики
// по прозрачным углам этой полосы (за пределами реальной формы спрайта) всё равно
// попадали бы в невидимое окно вместо рабочего стола/того что под ним. Вырезаем
// хитбокс по реальной альфе TASKBAR.png построчно (только для полосы нахлёста —
// ниже неё уже идёт обычный непрозрачный игровой прямоугольник, для него отдельный
// rect на всю ширину/высоту).
function computeTitlebarOverhangRects() {
    const taskbarPath = path.join(ASSETS, 'img', 'Scorcher', 'TASKBAR', 'TASKBAR.png');
    let img;
    try {
        img = nativeImage.createFromPath(taskbarPath);
    } catch (e) {
        console.error('[shape] Не удалось прочитать TASKBAR.png:', e.message);
        return [];
    }
    const { width, height } = img.getSize();
    if (!width || !height) return [];

    const bitmap = img.toBitmap(); // порядок каналов не важен — альфа всегда 4-й байт пикселя
    const rows = Math.min(OVERHANG_PX, height);

    function getRuns(y) {
        const runs = [];
        let start = null;
        for (let x = 0; x < width; x++) {
            const a = bitmap[(y * width + x) * 4 + 3];
            const opaque = a > 0;
            if (opaque && start === null) start = x;
            if (!opaque && start !== null) { runs.push([start, x]); start = null; }
        }
        if (start !== null) runs.push([start, width]);
        return runs;
    }

    function runsEqual(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        return a.every((r, i) => r[0] === b[i][0] && r[1] === b[i][1]);
    }

    const rects = [];
    let prevRuns = null;
    let rectStartY = 0;

    for (let y = 0; y < rows; y++) {
        const runs = getRuns(y);
        if (!runsEqual(runs, prevRuns)) {
            if (prevRuns) {
                for (const [x0, x1] of prevRuns) {
                    rects.push({ x: x0, y: rectStartY, width: x1 - x0, height: y - rectStartY });
                }
            }
            prevRuns = runs;
            rectStartY = y;
        }
    }
    if (prevRuns) {
        for (const [x0, x1] of prevRuns) {
            rects.push({ x: x0, y: rectStartY, width: x1 - x0, height: rows - rectStartY });
        }
    }

    return rects;
}

function updateWindowShape() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (process.platform === 'darwin') return; // setShape не поддерживается на macOS, не актуально для проекта

    const rects = computeTitlebarOverhangRects();
    // Игровая область под нахлёстом — обычный непрозрачный прямоугольник, кликается целиком как раньше
    rects.push({ x: 0, y: OVERHANG_PX, width: GAME_WIDTH, height: GAME_HEIGHT });

    try {
        mainWindow.setShape(rects);
    } catch (e) {
        console.error('[shape] setShape не сработал:', e.message);
    }
}

// ─── Главное окно ─────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: GAME_WIDTH,
        height: GAME_HEIGHT + OVERHANG_PX, // окно выше игрового контента на полосу нахлёста тайтлбара
        resizable: false,
        autoHideMenuBar: true,
        // transparent:true убран сознательно: он не нужен для нахлёста тайтлбара — этим занимается
        // setShape()/SetWindowRgn ниже (updateWindowShape), который работает на уровне ОС независимо
        // от transparent. А сам transparent на Windows переключает DirectComposition в режим
        // DXGI_ALPHA_MODE_PREMULTIPLIED вместо DXGI_ALPHA_MODE_IGNORE — это уводит Chromium с быстрого
        // GPU-пути композиции (лишние редраунды на каждый кадр видео, см. electron/electron#39895).
        // Цена — граница выреза становится аппаратно-жёсткой (aliased) вместо мягкого альфа-перехода,
        // визуально малозаметно на таком маленьком элементе (скруглённый угол ~30px).
        backgroundColor: '#0d0500',
        frame: false,
        useContentSize: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(ROOT, 'preload.js')
        },
        icon: path.join(ASSETS, 'icons', 'SCOROBEY.ico')
    });

    mainWindow.loadFile(path.join(SRC_SCORCHER, 'scorcher.html'));
    updateWindowShape(); // хитбокс не зависит от рендерера — считан один раз из альфы статичного PNG

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

// isDreamSeekerRunning()/killDreamSeeker() теперь живут в src/shared/dsProcessMonitor.js —
// общий постоянный PowerShell-хост вместо wmic (один на оба лаунчера быть не может —
// каждый процесс (main.js и scorcher_main.js) полностью независим и поднимает свой собственный
// PowerShell-хост, что совпадает с архитектурой проекта — отдельные BrowserWindow/трей/интервалы).

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
async function launchDreamSeeker(url, statusText) {
    if (state.dsPhase === 'LAUNCHING') return;

    state.dsPhase = 'LAUNCHING';
    state.launchDeadline = Date.now() + LAUNCH_GRACE_MS;
    state.childSeen = false;
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
            if (isHidden) showLauncher();
            break;

        case 'LAUNCHING':
            if (running) {
                state.dsPhase = 'PLAYING';
                if (hasChild) state.childSeen = true;
                sendStatus('');
            } else if (Date.now() > state.launchDeadline) {
                state.dsPhase = 'IDLE';
                showLauncher();
            }
            break;

        case 'PLAYING':
            if (!running) {
                state.dsPhase = 'IDLE';
                showLauncher();
            } else if (hasChild) {
                state.childSeen = true;
            } else if (state.childSeen) {
                state.dsPhase = 'IDLE';
                showLauncher();
                killDreamSeeker(); // без await — чистим зомби в фоне, не блокируя показ UI
            }
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
        if (running) return;
        handleAutoLaunch(state.autoServer);
    }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('save-settings', (event, settings) => {
    const prevHotkey = state.exitHotkey;
    Object.assign(state, settings);
    saveSettingsToDisk();
    if (state.exitHotkey !== prevHotkey) registerExitHotkey();
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
    scorcherRegion: state.scorcherRegion,
    exitHotkey: state.exitHotkey
}));

ipcMain.on('open-settings', createSettingsWindow);
ipcMain.on('open-external-url', (event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.on('set-volume',    (e, v) => { state.volume = v; if (mainWindow) mainWindow.webContents.send('update-volume', v); });
ipcMain.on('hide-window',   () => hideLauncher());
ipcMain.on('launch-server', (e, url) => handleLaunch(url));
ipcMain.on('minimize-window', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize(); });
ipcMain.on('close-window',    () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });
ipcMain.handle('get-auto-info', () => state.autoServer ? { server: state.autoServer, time: state.autoTime } : null);

// ─── Старт ────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    loadSettingsFromDisk();
    createWindow();
    createTray();
    createDesktopShortcut();
    registerExitHotkey();
    setInterval(processMonitorTask,       MONITOR_INTERVAL_MS);
    setInterval(timeBasedAutoConnectTask, 10000);
    setInterval(checkForUpdates,          UPDATE_CHECK_INTERVAL_MS);

    mainWindow.webContents.on('did-finish-load', () => {
        if (state.autoServer)
            mainWindow.webContents.send('auto-info-update', { server: state.autoServer, time: state.autoTime });
        mainWindow.webContents.send('servers-config-update', { community: state.community, scorcherRegion: state.scorcherRegion });
        checkForUpdates(); // первая проверка после того как renderer точно готов слушать IPC
    });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); stopMonitor(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
