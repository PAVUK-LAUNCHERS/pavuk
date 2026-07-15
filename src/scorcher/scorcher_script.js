document.addEventListener('DOMContentLoaded', function () {
    const serverButtons  = document.querySelectorAll('.server-button');
    const bgMusic        = document.getElementById('background-music');
    const clickSound     = document.getElementById('click-sound');
    const bgVideo        = document.getElementById('bg-video');
    const sandstormVideo = document.getElementById('sandstorm-video');
    const settingsBtn    = document.getElementById('settings-btn');

    bgMusic.volume = 0.5;

    let sandstormFinished = false;

    // ─── ЗЕРНО НА ФОН (canvas) ────────────────────────────────────────────────
    let grainInterval = null;
    let grainResizeHandler = null;
    let grainCanvas = null;
    let grainCtx = null;

    function initGrainBg() {
        grainCanvas = document.getElementById('grain-bg');
        if (!grainCanvas) return;
        grainCtx = grainCanvas.getContext('2d');

        grainResizeHandler = function () {
            grainCanvas.width  = window.innerWidth;
            grainCanvas.height = window.innerHeight;
        };
        grainResizeHandler();
        window.addEventListener('resize', grainResizeHandler);
    }

    function drawGrain() {
        const w = grainCanvas.width;
        const h = grainCanvas.height;
        const imageData = grainCtx.createImageData(w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            data[i]     = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
        grainCtx.putImageData(imageData, 0, 0);
    }

    function startGrainBg() {
        if (!grainCanvas) initGrainBg();
        if (!grainCanvas || grainInterval) return;
        const FPS = 18;
        drawGrain();
        grainInterval = setInterval(drawGrain, 1000 / FPS);
    }

    function stopGrainBg() {
        if (grainInterval) { clearInterval(grainInterval); grainInterval = null; }
    }

    // ─── ЗЕРНО НА ЛОГО (анимация SVG feTurbulence) ───────────────────────────
    let logoGrainInterval = null;
    let logoGrainT = 0;

    function startLogoGrain() {
        if (logoGrainInterval) return;
        const turbulence = document.querySelector('#logo-grain feTurbulence');
        if (!turbulence) return;

        const BASE = 0.72;
        const AMP  = 0.06;

        logoGrainInterval = setInterval(() => {
            logoGrainT += 0.04;
            const fx = BASE + Math.sin(logoGrainT * 1.3) * AMP;
            const fy = BASE + Math.cos(logoGrainT * 0.9) * AMP;
            turbulence.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
            turbulence.setAttribute('seed', (Math.random() * 1000 | 0).toString());
        }, 55);
    }

    function stopLogoGrain() {
        if (logoGrainInterval) { clearInterval(logoGrainInterval); logoGrainInterval = null; }
    }

    // ─── Фоновое видео ────────────────────────────────────────────────────────
    function pauseBgVideo() { bgVideo.pause(); }
    function resumeBgVideo() { bgVideo.play().catch(() => {}); }

    function startHeavyEffects() {
        startGrainBg();
        startLogoGrain();
        resumeBgVideo();
    }

    function stopHeavyEffects() {
        stopGrainBg();
        stopLogoGrain();
        pauseBgVideo();
    }

    startHeavyEffects();

    // ─── IPC-обработчики ───────────────────────────────────────────────────────

    if (window.electronAPI) {

        window.electronAPI.onVolumeUpdate((volume) => {
            bgMusic.volume = volume;
        });

        window.electronAPI.onPrepareHide(() => {
            bgMusic.pause();
            bgMusic.currentTime = 0;
            sandstormVideo.pause();
            sandstormVideo.currentTime = 0;
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

    function startMusic() {
        if (!musicStarted) {
            bgMusic.play().catch(() => {});
            musicStarted = true;
        }
    }

    document.addEventListener('mousemove', startMusic, { once: true });
    document.addEventListener('click',     startMusic, { once: true });

    // ─── Клик по серверу ──────────────────────────────────────────────────────
    // ─── Бейдж уведомления об обновлении ───────────────────────────────────
    let updateBadge = null;

    function showUpdateBadge(info) {
        if (!info || !info.version) return;
        if (!updateBadge) {
            updateBadge = document.createElement('div');
            updateBadge.id = 'update-badge';
            Object.assign(updateBadge.style, {
                position: 'fixed',
                top: '10px',
                right: '10px',
                zIndex: '9999',
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
        updateBadge.textContent = `Доступно обновление: ${info.version} (клик для скачивания)`;
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

    // Возвращает расписание окна показа для текущего региона сообщества
    function getWeekendSchedule() {
        if (currentCommunity === 'kz') {
            return {
                timeZone: 'UTC',
                startMinute: 0 * 1440 + 15 * 60, // воскресенье 15:00 GMT
                endMinute:   1 * 1440 + 0         // понедельник 00:00 GMT
            };
        }
        return {
            timeZone: 'Europe/Moscow',
            startMinute: 5 * 1440 + 18 * 60, // пятница 18:00 МСК
            endMinute:   6 * 1440 + 2 * 60    // суббота 02:00 МСК
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
