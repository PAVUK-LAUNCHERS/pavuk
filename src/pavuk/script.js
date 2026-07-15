document.addEventListener('DOMContentLoaded', function() {
    const serverButtons = document.querySelectorAll('.server-button');
    const backgroundMusic = document.getElementById('background-music');
    const clickSound = document.getElementById('click-sound');
    const backgroundImage = document.getElementById('background-image');
    const flashVideo = document.getElementById('flash-video');
    const flash01Video = document.getElementById('flash01-video');
    const backgroundContainer = document.querySelector('.background-container');
    const settingsBtn = document.getElementById('settings-btn');

    backgroundMusic.volume = 0.5;

    if (window.electronAPI) {
        window.electronAPI.onVolumeUpdate((volume) => {
            backgroundMusic.volume = volume;
        });
        
        // Остановка медиа и очистка таймеров перед скрытием
        window.electronAPI.onPrepareHide(() => {
            backgroundMusic.pause();
            backgroundMusic.currentTime = 0;
            flashVideo.pause();
            flashVideo.classList.remove('active');
            flash01Video.pause();
            flash01Video.classList.remove('active');
            if (flashTimeoutId) { clearTimeout(flashTimeoutId); flashTimeoutId = null; }
            if (fadeAudioInterval) { clearInterval(fadeAudioInterval); fadeAudioInterval = null; }
            stopWeekendTimer(); // экономия CPU/памяти: таймер бесполезен, пока окно скрыто
        });

        // Статус-индикатор (CONNECTING... / AUTO-CONNECTING...)
        window.electronAPI.onStatusUpdate((status) => {
            const el = document.getElementById('status-text');
            if (el) {
                el.textContent = status || '';
                el.style.display = status ? 'block' : 'none';
            }
        });

        // Инфо об авто-подключении
        window.electronAPI.onAutoInfoUpdate((info) => {
            updateAutoConnectDisplay(info);
        });

        // Обновление портов серверов при смене региона сообщества (RU/KZ) в настройках
        window.electronAPI.onServersConfigUpdate((cfg) => {
            updateServerPorts(cfg.community);
            currentCommunity = cfg.community || 'ru';
            updateWeekendTimer(); // расписание таймера может зависеть от региона
        });

        // Уведомление о новой версии (бэкенд / GitHub Releases fallback) — мягкое, без блокировки
        window.electronAPI.onUpdateAvailable((info) => {
            showUpdateBadge(info);
        });
    }

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
                background: 'rgba(20, 0, 0, 0.9)',
                border: '1px solid #ff6666',
                color: '#ffaaaa',
                padding: '8px 14px',
                fontFamily: "'LinBiolinum', sans-serif",
                fontSize: '0.8rem',
                letterSpacing: '0.5px',
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(255, 0, 0, 0.4)',
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
    // ru = русские порты (1984), kz = английские порты (1923)
    function getPortForCommunity(community) {
        return community === 'kz' ? 1923 : 1984;
    }

    function updateServerPorts(community) {
        const port = getPortForCommunity(community);
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
            updateServerPorts(currentCommunity);
            updateWeekendTimer();
        }).catch(() => {});
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', function() {
            if (window.electronAPI) {
                window.electronAPI.openSettings();
            }
        });
    }

    document.addEventListener('mousemove', function(e) {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
        backgroundContainer.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.05)`;
    });

    // ─── Таймер до выходных ─────────────────────────────────────────────────────
    // RU (community='ru'): окно "PARTY HARD" активно с субботы 11:00 МСК до понедельника 00:00 МСК.
    // KZ / INTERZONE (community='kz'): окно активно с пятницы 15:00 GMT до ночи с субботы на воскресенье (воскресенье 00:00 GMT).
    // Таймер останавливается, пока окно скрыто (экономия CPU/памяти в фоне).
    let weekendTimerInterval = null;

    function getTimeParts(timeZone) {
        // Intl.DateTimeFormat с заданной timeZone даёт корректное время независимо
        // от локального часового пояса и переходов на летнее/зимнее время.
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
                startMinute: 5 * 1440 + 15 * 60, // пятница 15:00 GMT
                endMinute:   0 * 1440 + 0         // воскресенье 00:00 GMT
            };
        }
        return {
            timeZone: 'Europe/Moscow',
            startMinute: 6 * 1440 + 11 * 60, // суббота 11:00 МСК
            endMinute:   1 * 1440 + 0         // понедельник 00:00 МСК
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
            el.textContent = 'PARTY HARD';
            el.style.color = '#ff0000';
            el.style.fontSize = '1.4rem';
            el.style.fontWeight = 'bold';
            el.style.letterSpacing = '0.15em';
            el.style.textShadow = '0 0 10px #ff0000, 0 0 25px #ff0000';
            return;
        }

        // Считаем оставшееся время до старта в секундах
        let minutesUntilStart = startMinute - minutesOfWeek;
        if (minutesUntilStart < 0) minutesUntilStart += 7 * 1440;
        const totalSecondsUntilStart = minutesUntilStart * 60 - secondsOfDay;

        const days    = Math.floor(totalSecondsUntilStart / 86400);
        const hours   = Math.floor((totalSecondsUntilStart % 86400) / 3600);
        const minutes = Math.floor((totalSecondsUntilStart % 3600) / 60);
        const seconds = totalSecondsUntilStart % 60;

        el.textContent = `Time until weekend: ${days}d ${hours}h ${minutes}m ${seconds}s`;
        el.style.color = '';
        el.style.fontSize = '';
        el.style.fontWeight = '';
        el.style.letterSpacing = '';
        el.style.textShadow = '';
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

    // Отображение авто-подключения
    function updateAutoConnectDisplay(info) {
        const el = document.getElementById('auto-connect-info');
        if (!el) return;
        if (info && info.server) {
            const serverName = info.server.replace('byond://', '').replace(/:\d+$/, '').toUpperCase();
            el.textContent = `AUTO-CONNECT: ${serverName} @ ${info.time}`;
            el.style.display = 'block';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    let musicStarted = false;
    let flashTimeoutId = null;
    let fadeAudioInterval = null;
    function startMusic() {
        if (!musicStarted) {
            backgroundMusic.play().catch(e => console.log('Music autoplay blocked'));
            musicStarted = true;
        }
    }

    function playFlash() {
        flashVideo.classList.add('active');
        flashVideo.currentTime = 0;
        flashVideo.play();
        flashVideo.onended = function() {
            flashVideo.classList.remove('active');
            scheduleNextFlash();
        };
    }

    function scheduleNextFlash() {
        const delay = (Math.random() * (40 - 15) + 15) * 1000;
        flashTimeoutId = setTimeout(playFlash, delay);
    }

    scheduleNextFlash();

    serverButtons.forEach(button => {
        button.addEventListener('click', function() {
            const serverUrl = this.getAttribute('data-server');
            startMusic();
            clickSound.currentTime = 0;
            clickSound.play().catch(e => console.log('Click sound failed'));
            this.style.transform = 'scale(0.95)';
            setTimeout(() => { this.style.transform = ''; }, 200);
            flash01Video.classList.add('active');
            flash01Video.currentTime = 0;
            flash01Video.play();
            flash01Video.onended = function() {
                flash01Video.classList.remove('active');
            };
            if (fadeAudioInterval) clearInterval(fadeAudioInterval);
            fadeAudioInterval = setInterval(() => {
                if (backgroundMusic.volume > 0.05) { backgroundMusic.volume -= 0.05; }
                else { backgroundMusic.volume = 0; clearInterval(fadeAudioInterval); fadeAudioInterval = null; }
            }, 50);
            setTimeout(() => {
                if (window.electronAPI) {
                    window.electronAPI.launchServer(serverUrl);
                }
            }, 1000);
        });
    });

    document.addEventListener('mousemove', startMusic, { once: true });
    document.addEventListener('click', startMusic, { once: true });

    if (window.electronAPI) {
        window.electronAPI.onRestore((volume) => {
            backgroundMusic.pause();
            backgroundMusic.currentTime = 0;
            // Плавное нарастание громкости вместо резкого включения
            const targetVolume = typeof volume === 'number' ? volume : 0.5;
            backgroundMusic.volume = 0;
            backgroundMusic.play().catch(e => console.log('Music autoplay blocked on restore'));
            let fadeInInterval = setInterval(() => {
                if (backgroundMusic.volume < targetVolume - 0.03) {
                    backgroundMusic.volume = Math.min(backgroundMusic.volume + 0.03, targetVolume);
                } else {
                    backgroundMusic.volume = targetVolume;
                    clearInterval(fadeInInterval);
                }
            }, 40);
            musicStarted = true;
            flashVideo.classList.remove('active');
            flashVideo.pause();
            flashVideo.currentTime = 0;
            flash01Video.classList.remove('active');
            flash01Video.pause();
            flash01Video.currentTime = 0;
            // Очистка таймеров перед перезапуском, чтобы не накапливать flash-цепочки
            if (flashTimeoutId) { clearTimeout(flashTimeoutId); flashTimeoutId = null; }
            if (fadeAudioInterval) { clearInterval(fadeAudioInterval); fadeAudioInterval = null; }
            scheduleNextFlash();
            startWeekendTimer(); // возобновляем таймер при показе лаунчера
        });
    }
});
