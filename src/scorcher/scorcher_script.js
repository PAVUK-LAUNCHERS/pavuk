document.addEventListener('DOMContentLoaded', function () {
    const serverButtons  = document.querySelectorAll('.server-button');
    const bgMusic        = document.getElementById('background-music');
    const clickSound     = document.getElementById('click-sound');
    const bgVideo        = document.getElementById('bg-video');
    const sandstormVideo = document.getElementById('sandstorm-video');
    const settingsBtn    = document.getElementById('settings-btn');

    bgMusic.volume = 0.5;

    let sandstormFinished = false;

    // ─── ЗЕРНО: ОБЩИЙ ГЕНЕРАТОР ПРЕДПРОСЧИТАННЫХ КАДРОВ ─────────────────────────
    function buildGrainFrame(w, h) {
        const frame = document.createElement('canvas');
        frame.width = w;
        frame.height = h;
        const fctx = frame.getContext('2d');
        const imageData = fctx.createImageData(w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
        }
        fctx.putImageData(imageData, 0, 0);
        return frame;
    }

    function createFrameGrain({ getCanvas, downscale, frameCount, frameMs, sizeFn }) {
        let canvas = null, ctx = null, frames = [], frameIndex = 0, interval = null;

        function init() {
            canvas = getCanvas();
            if (!canvas) return;
            ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const { w, h } = sizeFn();
            canvas.width  = Math.max(1, Math.ceil(w / downscale));
            canvas.height = Math.max(1, Math.ceil(h / downscale));
        }

        function buildFrames() {
            if (!canvas || !canvas.width) return;
            frames = [];
            for (let i = 0; i < frameCount; i++) {
                frames.push(buildGrainFrame(canvas.width, canvas.height));
            }
        }

        function draw() {
            if (!ctx || !frames.length) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(frames[frameIndex], 0, 0);
            frameIndex = (frameIndex + 1) % frameCount;
        }

        function start() {
            if (!canvas || !canvas.width) init();
            if (!canvas || interval) return;
            if (!frames.length) buildFrames();
            draw();
            interval = setInterval(draw, frameMs);
        }

        function stop() {
            if (interval) { clearInterval(interval); interval = null; }
            frames = [];
            frameIndex = 0;
            if (canvas) { canvas.width = 0; canvas.height = 0; }
        }

        function refresh() {
            const wasRunning = !!interval;
            stop();
            if (wasRunning) start();
        }

        return { start, stop, refresh };
    }

    // ─── ЗЕРНО НА ФОН: 18 кадров, 3 fps ────────────────────────────────────────
    const bgGrain = createFrameGrain({
        getCanvas: () => document.getElementById('grain-bg'),
        downscale: 4,
        frameCount: 18,
        frameMs: Math.round(1000 / 3),
        sizeFn: () => ({ w: window.innerWidth, h: window.innerHeight })
    });

    // ─── ЗЕРНО НА ЛОГО: 6 кадров, 1 fps ────────────────────────────────────────
    const logoGrain = createFrameGrain({
        getCanvas: () => document.querySelector('.logo-grain-canvas'),
        downscale: 1,
        frameCount: 6,
        frameMs: 1000, // 1 fps
        sizeFn: () => {
            const wrapper = document.querySelector('.logo-wrapper');
            const w = wrapper ? wrapper.clientWidth  : 0;
            const h = wrapper ? wrapper.clientHeight : 0;
            return { w: w || 400, h: h || 300 };
        }
    });

    const logoImgEl = document.querySelector('.logo-img');
    if (logoImgEl) {
        if (logoImgEl.complete) {
            logoGrain.refresh();
        } else {
            logoImgEl.addEventListener('load', () => logoGrain.refresh(), { once: true });
        }
    }

    // ─── ГОЛОГРАММА ИКОНКИ В НИШЕ ТАЙТЛБАРА ────────────────────────────────────
    const ICON_RES        = 64;
    const ICON_STRIP_H    = 4;
    const ICON_WAVE_AMP   = 3.5;
    const ICON_WAVE_SPEED = Math.PI / 3;
    const ICON_WAVE_FREQ  = 0.55;
    const ICON_TINT_DARK  = [18, 30, 60];
    const ICON_TINT_LIGHT = [175, 225, 255];
    const ICON_STRIPE_DARKEN = 0.14;
    const ICON_SRC        = '../../assets/icons/SCOROBEY.ico';

    const iconCanvas = document.getElementById('titlebar-icon-canvas');
    let iconCtx = null, iconTintedCanvas = null, iconTintedDarkCanvas = null, iconRafId = null, iconAnimStart = 0;

    function buildTintedIcon(img) {
        const off = document.createElement('canvas');
        off.width = ICON_RES;
        off.height = ICON_RES;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, ICON_RES, ICON_RES);

        const imgData = octx.getImageData(0, 0, ICON_RES, ICON_RES);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
            d[i]     = ICON_TINT_DARK[0] + (ICON_TINT_LIGHT[0] - ICON_TINT_DARK[0]) * lum;
            d[i + 1] = ICON_TINT_DARK[1] + (ICON_TINT_LIGHT[1] - ICON_TINT_DARK[1]) * lum;
            d[i + 2] = ICON_TINT_DARK[2] + (ICON_TINT_LIGHT[2] - ICON_TINT_DARK[2]) * lum;
        }
        octx.putImageData(imgData, 0, 0);
        return off;
    }

    function buildDarkenedCopy(sourceCanvas, amount) {
        const off = document.createElement('canvas');
        off.width = sourceCanvas.width;
        off.height = sourceCanvas.height;
        const octx = off.getContext('2d');
        octx.drawImage(sourceCanvas, 0, 0);
        octx.globalCompositeOperation = 'source-atop';
        octx.fillStyle = `rgba(0, 0, 0, ${amount})`;
        octx.fillRect(0, 0, off.width, off.height);
        octx.globalCompositeOperation = 'source-over';
        return off;
    }

    function drawIconHologramFrame(tsMs) {
        if (!iconCtx || !iconTintedCanvas) return;
        const t = (tsMs - iconAnimStart) / 1000;
        iconCtx.clearRect(0, 0, ICON_RES, ICON_RES);
        for (let y = 0, stripIndex = 0; y < ICON_RES; y += ICON_STRIP_H, stripIndex++) {
            const dx = Math.sin(t * ICON_WAVE_SPEED + stripIndex * ICON_WAVE_FREQ) * ICON_WAVE_AMP;
            const src = (stripIndex % 2 === 1) ? iconTintedDarkCanvas : iconTintedCanvas;
            iconCtx.drawImage(src, 0, y, ICON_RES, ICON_STRIP_H, dx, y, ICON_RES, ICON_STRIP_H);
        }
        iconRafId = requestAnimationFrame(drawIconHologramFrame);
    }

    function startIconHologram() {
        if (!iconCanvas || iconRafId) return;
        if (!iconCtx) iconCtx = iconCanvas.getContext('2d');

        function begin() {
            iconAnimStart = performance.now();
            iconRafId = requestAnimationFrame(drawIconHologramFrame);
        }

        if (iconTintedCanvas) {
            begin();
        } else {
            const img = new Image();
            img.onload = () => {
                iconTintedCanvas = buildTintedIcon(img);
                iconTintedDarkCanvas = buildDarkenedCopy(iconTintedCanvas, ICON_STRIPE_DARKEN);
                begin();
            };
            img.src = ICON_SRC;
        }
    }

    function stopIconHologram() {
        if (iconRafId) { cancelAnimationFrame(iconRafId); iconRafId = null; }
    }

    const BG_VIDEO_SRC        = bgVideo.getAttribute('src');
    const SANDSTORM_VIDEO_SRC = sandstormVideo.getAttribute('src');

    function destroyBgVideo() {
        bgVideo.pause();
        bgVideo.removeAttribute('src');
        bgVideo.load();
    }
    function restoreBgVideo() {
        bgVideo.src = BG_VIDEO_SRC;
        bgVideo.load();
        bgVideo.play().catch(() => {});
    }

    function destroySandstormVideo() {
        sandstormVideo.pause();
        sandstormVideo.removeAttribute('src');
        sandstormVideo.load();
    }
    function restoreSandstormVideo() {
        sandstormVideo.src = SANDSTORM_VIDEO_SRC;
        sandstormVideo.load();
    }

    function destroyIconHologramCache() {
        iconTintedCanvas = null;
        iconTintedDarkCanvas = null;
    }

    function startHeavyEffects() {
        restoreBgVideo();
        restoreSandstormVideo();
        bgGrain.start();
        logoGrain.start();
        startIconHologram();
    }

    function stopHeavyEffects() {
        bgGrain.stop();
        logoGrain.stop();
        stopIconHologram();
        destroyIconHologramCache();
        destroyBgVideo();
        destroySandstormVideo();
    }

    startHeavyEffects();

    // ─── Кнопки тайтлбара ───────────────────────────────────
    const titlebarButtons = [
        { canvas: document.getElementById('titlebar-collapse'), src: '../../assets/img/Scorcher/TASKBAR/COLLAPSE.png', action: () => { if (window.electronAPI) window.electronAPI.minimizeWindow(); } },
        { canvas: document.getElementById('titlebar-close'),    src: '../../assets/img/Scorcher/TASKBAR/CLOSE.png',    action: () => { if (window.electronAPI) window.electronAPI.closeWindow(); } }
    ];

    titlebarButtons.forEach(({ canvas, src, action }) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        let loaded = false;

        function drawNormal() {
            ctx.clearRect(0, 0, 24, 24);
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(img, 0, 0, 24, 24);
        }

        function drawPressed() {
            drawNormal();
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fillRect(0, 0, 24, 24);
            ctx.globalCompositeOperation = 'source-over';
        }

        img.onload = () => { loaded = true; drawNormal(); };
        img.src = src;

        canvas.addEventListener('mousedown',  () => { if (loaded) drawPressed(); });
        canvas.addEventListener('mouseup',    () => { if (loaded) drawNormal(); });
        canvas.addEventListener('mouseleave', () => { if (loaded) drawNormal(); });
        canvas.addEventListener('click', action);
    });

    // ─── IPC-обработчики ───────────────────────────────────────────────────────

    if (window.electronAPI) {

        window.electronAPI.onVolumeUpdate((volume) => {
            bgMusic.volume = volume;
        });

        window.electronAPI.onPrepareHide(() => {
            bgMusic.pause();
            bgMusic.currentTime = 0;
            sandstormVideo.classList.remove('active');
            sandstormFinished = false;
            if (fadeAudioInterval) { clearInterval(fadeAudioInterval); fadeAudioInterval = null; }
            stopWeekendTimer();
            stopHeavyEffects();
        });

        window.electronAPI.onStatusUpdate((status) => {
            const el = document.getElementById('status-text');
            if (el) {
                el.textContent = status || '';
                el.style.display = status ? 'block' : 'none';
            }
        });

        window.electronAPI.onAutoInfoUpdate((info) => {
            updateAutoConnectDisplay(info);
        });

        window.electronAPI.onServersConfigUpdate((cfg) => {
            updateServerPorts(cfg.community, cfg.scorcherRegion);
            currentCommunity = cfg.community || 'ru';
            updateWeekendTimer();
        });

        window.electronAPI.onUpdateAvailable((info) => {
            showUpdateBadge(info);
        });

        window.electronAPI.onRestore((volume) => {
            bgMusic.pause();
            bgMusic.currentTime = 0;

            const targetVolume = typeof volume === 'number' ? volume : 0.5;
            bgMusic.volume = 0;
            bgMusic.play().catch(() => {});

            let fadeIn = setInterval(() => {
                if (bgMusic.volume < targetVolume - 0.03) {
                    bgMusic.volume = Math.min(bgMusic.volume + 0.03, targetVolume);
                } else {
                    bgMusic.volume = targetVolume;
                    clearInterval(fadeIn);
                }
            }, 40);

            musicStarted = true;

            sandstormVideo.classList.remove('active');
            sandstormVideo.pause();
            sandstormVideo.currentTime = 0;
            sandstormFinished = false;

            if (fadeAudioInterval) { clearInterval(fadeAudioInterval); fadeAudioInterval = null; }
            startWeekendTimer();
            startHeavyEffects();

            launchInProgress = false;
            serverButtons.forEach(b => b.style.pointerEvents = '');
        });
    }

    // ─── Кнопка настроек ──────────────────────────────────────────────────────
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (window.electronAPI) window.electronAPI.openSettings();
        });
    }

    // ─── Музыка ───────────────────────────────────────────────────────────────
    let musicStarted = false;
    let fadeAudioInterval = null;
    let launchInProgress = false;

    function startMusic() {
        if (!musicStarted) {
            bgMusic.play().catch(() => {});
            musicStarted = true;
        }
    }

    document.addEventListener('mousemove', startMusic, { once: true });
    document.addEventListener('click',     startMusic, { once: true });

    // ─── Бейдж уведомления об обновлении ───────────────────────────────────
    let updateBadge = null;

    function showUpdateBadge(info) {
        if (!info || !info.version) return;
        if (!updateBadge) {
            updateBadge = document.createElement('div');
            updateBadge.id = 'update-badge';
            Object.assign(updateBadge.style, {
                position: 'fixed',
                top: '60px',
                left: '10px',
                zIndex: '999',
                background: 'rgba(20, 8, 0, 0.9)',
                border: '1px solid #ff6a00',
                color: '#ffaa66',
                padding: '8px 14px',
                fontFamily: "'LinBiolinum', sans-serif",
                fontSize: '0.8rem',
                letterSpacing: '0.5px',
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(255, 100, 0, 0.5)',
                borderRadius: '3px'
            });
            document.body.appendChild(updateBadge);
            updateBadge.addEventListener('click', () => {
                if (updateBadge.dataset.url && window.electronAPI) {
                    window.electronAPI.openExternalUrl(updateBadge.dataset.url);
                }
            });
        }
        updateBadge.textContent = `Update available: ${info.version} (click to download)`;
        updateBadge.title = info.notes || '';
        updateBadge.dataset.url = info.url || '';
        updateBadge.style.display = info.url ? 'block' : 'none';
    }

    // ─── Переключение портов серверов по региону сообщества ──────────────────
    function getPortForCommunity(community, scorcherRegion) {
        if (community === 'kz') return scorcherRegion === 'beta' ? 1414 : 1441;
        return 1444;
    }

    function updateServerPorts(community, scorcherRegion) {
        const port = getPortForCommunity(community, scorcherRegion);
        serverButtons.forEach(btn => {
            const url = btn.getAttribute('data-server');
            if (!url) return;
            btn.setAttribute('data-server', url.replace(/:\d+$/, ':' + port));
        });
    }

    let currentCommunity = 'ru';

    if (window.electronAPI) {
        window.electronAPI.getSettings().then(settings => {
            currentCommunity = settings.community || 'ru';
            updateServerPorts(currentCommunity, settings.scorcherRegion);
            updateWeekendTimer();
        }).catch(() => {});
    }

    serverButtons.forEach(button => {
        button.addEventListener('click', function () {
            if (launchInProgress) return;
            launchInProgress = true;
            serverButtons.forEach(b => b.style.pointerEvents = 'none');

            const serverUrl = this.getAttribute('data-server');
            startMusic();

            clickSound.currentTime = 0;
            clickSound.play().catch(() => {});

            this.style.transform = 'translateX(4px) scale(0.96)';
            setTimeout(() => { this.style.transform = ''; }, 200);

            if (fadeAudioInterval) clearInterval(fadeAudioInterval);
            fadeAudioInterval = setInterval(() => {
                if (bgMusic.volume > 0.05) {
                    bgMusic.volume = Math.max(bgMusic.volume - 0.05, 0);
                } else {
                    bgMusic.volume = 0;
                    clearInterval(fadeAudioInterval);
                    fadeAudioInterval = null;
                }
            }, 50);

            sandstormFinished = false;

            sandstormVideo.classList.add('active');
            sandstormVideo.currentTime = 0;
            sandstormVideo.play().catch(() => {});

            sandstormVideo.onended = function () {
                sandstormFinished = true;
                if (window.electronAPI) {
                    window.electronAPI.launchServer(serverUrl);
                }
            };
        });
    });

    // ─── Авто-подключение: отображение ────────────────────────────────────────
    function updateAutoConnectDisplay(info) {
        const el = document.getElementById('auto-connect-info');
        if (!el) return;
        if (info && info.server) {
            const serverName = info.server
                .replace('byond://', '')
                .replace(/:\d+$/, '')
                .toUpperCase();
            el.textContent = `AUTO-CONNECT: ${serverName} @ ${info.time}`;
            el.style.display = 'block';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    // ─── Таймер до выходных ─────────────────────────────────────────────────────
    let weekendTimerInterval = null;

    function getTimeParts(timeZone) {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone,
            weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
        const parts = fmt.formatToParts(new Date());
        const map = {};
        parts.forEach(p => { map[p.type] = p.value; });
        const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        return {
            day: weekdayMap[map.weekday],
            hour: parseInt(map.hour, 10) % 24,
            minute: parseInt(map.minute, 10),
            second: parseInt(map.second, 10)
        };
    }

    function getWeekendSchedule() {
        if (currentCommunity === 'kz') {
            return {
                timeZone: 'UTC',
                startMinute: 0 * 1440 + 15 * 60,
                endMinute:   1 * 1440 + 0
            };
        }
        return {
            timeZone: 'Europe/Moscow',
            startMinute: 5 * 1440 + 18 * 60,
            endMinute:   6 * 1440 + 2 * 60
        };
    }

    function updateWeekendTimer() {
        const el = document.getElementById('weekend-timer');
        if (!el) return;

        const schedule = getWeekendSchedule();
        const t = getTimeParts(schedule.timeZone);
        const minutesOfWeek = t.day * 1440 + t.hour * 60 + t.minute;
        const secondsOfDay = t.second;

        const { startMinute, endMinute } = schedule;
        const wraps = endMinute < startMinute;
        const isShowTime = wraps
            ? (minutesOfWeek >= startMinute || minutesOfWeek < endMinute)
            : (minutesOfWeek >= startMinute && minutesOfWeek < endMinute);

        if (isShowTime) {
            el.textContent = 'The show has already started!';
            el.style.color = '#ff4400';
            el.style.fontSize = '1.1rem';
            return;
        }

        let minutesUntilStart = startMinute - minutesOfWeek;
        if (minutesUntilStart < 0) minutesUntilStart += 7 * 1440;
        const totalSecondsUntilStart = minutesUntilStart * 60 - secondsOfDay;

        const d = Math.floor(totalSecondsUntilStart / 86400);
        const h = Math.floor((totalSecondsUntilStart % 86400) / 3600);
        const m = Math.floor((totalSecondsUntilStart % 3600) / 60);
        const s = totalSecondsUntilStart % 60;

        el.textContent = `Time until Friday: ${d}d ${h}h ${m}m ${s}s`;
        el.style.color = '';
        el.style.fontSize = '';
    }

    function startWeekendTimer() {
        if (weekendTimerInterval) return;
        updateWeekendTimer();
        weekendTimerInterval = setInterval(updateWeekendTimer, 1000);
    }

    function stopWeekendTimer() {
        if (weekendTimerInterval) { clearInterval(weekendTimerInterval); weekendTimerInterval = null; }
    }

    startWeekendTimer();
});
