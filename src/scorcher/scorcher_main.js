const { app, BrowserWindow, shell, ipcMain, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const { isDreamSeekerRunning, killDreamSeeker, stopMonitor } = require('../shared/dsProcessMonitor');
const { UPDATE_CHECK_INTERVAL_MS, checkForUpdates: checkForUpdatesShared } = require('../shared/updateChecker');

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
const GAME_WIDTH   = 900;
const GAME_HEIGHT  = 700;
const OVERHANG_PX  = 10;

let APP_VERSION = '0.0.0';
try {
    APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version || APP_VERSION;
} catch (e) {
    console.error('Failed to read version from package.json:', e.message);
}

async function checkForUpdates() {
    await checkForUpdatesShared(APP_VERSION, (remote) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-available', remote);
    });
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

    const bitmap = img.toBitmap();
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
    if (process.platform === 'darwin') return;

    const rects = computeTitlebarOverhangRects();
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
        height: GAME_HEIGHT + OVERHANG_PX,
        resizable: false,
        autoHideMenuBar: true,
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
    updateWindowShape();

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
                killDreamSeeker();
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
        checkForUpdates();
    });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); stopMonitor(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
