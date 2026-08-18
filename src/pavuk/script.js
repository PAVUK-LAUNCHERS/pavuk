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

    // ─── ГОЛОГРАММА ИКОНКИ В НИШЕ ТАЙТЛБАРА ────────────────────────────────────
    // Тот же принцип, что и у Scorcher (тонировка по яркости + разбивка на горизонтальные
    // полоски), но вместо плавной бегущей волны — "лагающая" голограмма: большую часть времени
    // иконка стоит на месте, и раз в 1–3 секунды ОДНА случайная полоска резко дёргается вбок
    // и почти сразу возвращается (имитация сбоя сигнала), а не постоянное синхронное покачивание.
    // Палитра — жёлто-оранжевая (в цвет TASKBAR.png/лого лаунчера), не голубая, как у Scorcher.
    const ICON_RES        = 64;
    const ICON_STRIP_H    = 4;
    const ICON_DRAW_SIZE  = 60;            // размер иконки внутри 64px канваса (по краям — поля)
    const ICON_TINT_DARK  = [60, 28, 0];    // тёмно-оранжевый (тень)
    const ICON_TINT_LIGHT = [255, 205, 90]; // светлый жёлто-оранжевый (свет)
    const ICON_STRIPE_DARKEN = 0.14;        // насколько темнее каждая вторая полоска
    const ICON_SRC        = '../../assets/icons/PAVUK.ico';

    // Микро-волна: очень малая амплитуда, почти незаметное покачивание
    const ICON_WAVE_AMP   = 0.8;   // px — в разы меньше чем у Scorcher (3.5px)
    const ICON_WAVE_SPEED = 3;  // рад/с (медленно)
    const ICON_WAVE_FREQ  = 0.3;   // рад/полоску (мелкая рябь)

    // Пульсация opacity
    const ICON_PULSE_SPEED = 1.3;  // рад/с → период ≈ 4.8с
    const ICON_PULSE_MIN   = 0.6;  // мин. opacity
    const ICON_PULSE_MAX   = 1.0;  // макс. opacity

    // Параметры лаг-сдвига: раз в 1–3 сек одна случайная полоска резко дёргается вбок
    // и возвращается обратно за GLITCH_DURATION мс (имитация сбоя сигнала).
    const GLITCH_MIN_DELAY_MS = 500;
    const GLITCH_MAX_DELAY_MS = 1500;
    const GLITCH_DURATION_MS  = 90;
    const GLITCH_AMP_MIN      = 4;
    const GLITCH_AMP_MAX      = 10;

    const iconCanvas = document.getElementById('titlebar-icon-canvas');
    let iconCtx = null, iconTintedCanvas = null, iconTintedDarkCanvas = null, iconRafId = null;
    let iconStripCount = 0;
    let glitchStripIndex = -1, glitchOffsetX = 0, glitchTimeoutId = null, glitchRevertTimeoutId = null;

    function buildTintedIcon(img) {
        const off = document.createElement('canvas');
        off.width = ICON_RES;
        off.height = ICON_RES;
        const octx = off.getContext('2d');
        // Рисуем иконку меньшего размера по центру канваса (оставляем поля по краям)
        const offset = (ICON_RES - ICON_DRAW_SIZE) / 2;
        octx.drawImage(img, offset, offset, ICON_DRAW_SIZE, ICON_DRAW_SIZE);

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

    // Затемнённая копия уже тонированного канваса — source-atop кладёт чёрный оверлей ТОЛЬКО
    // на уже непрозрачные пиксели иконки (та же техника, что и в drawPressed() у кнопок тайтлбара).
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
        const t = tsMs / 1000;
        // Пульсация opacity: медленно меняется от ICON_PULSE_MIN до ICON_PULSE_MAX
        const pulse = ICON_PULSE_MIN + (ICON_PULSE_MAX - ICON_PULSE_MIN) * (0.5 + 0.5 * Math.sin(t * ICON_PULSE_SPEED));
        iconCtx.clearRect(0, 0, ICON_RES, ICON_RES);
        iconCtx.globalAlpha = pulse;
        for (let y = 0, stripIndex = 0; y < ICON_RES; y += ICON_STRIP_H, stripIndex++) {
            // Микро-волна на всех полосках + глич поверх неё для одной случайной полоски
            const waveDx = Math.sin(t * ICON_WAVE_SPEED + stripIndex * ICON_WAVE_FREQ) * ICON_WAVE_AMP;
            const dx = (stripIndex === glitchStripIndex) ? glitchOffsetX : waveDx;
            const src = (stripIndex % 2 === 1) ? iconTintedDarkCanvas : iconTintedCanvas;
            iconCtx.drawImage(src, 0, y, ICON_RES, ICON_STRIP_H, dx, y, ICON_RES, ICON_STRIP_H);
        }
        iconCtx.globalAlpha = 1;
        iconRafId = requestAnimationFrame(drawIconHologramFrame);
    }

    // Раз в 1–3 сек выбирает случайную полоску и резко сдвигает её вбок, затем возвращает
    // на место — имитация "лага" голограммы, а не плавная бегущая волна.
    function scheduleGlitch() {
        const delay = GLITCH_MIN_DELAY_MS + Math.random() * (GLITCH_MAX_DELAY_MS - GLITCH_MIN_DELAY_MS);
        glitchTimeoutId = setTimeout(() => {
            if (iconStripCount > 0) {
                glitchStripIndex = Math.floor(Math.random() * iconStripCount);
                const amp = GLITCH_AMP_MIN + Math.random() * (GLITCH_AMP_MAX - GLITCH_AMP_MIN);
                glitchOffsetX = Math.random() < 0.5 ? -amp : amp;
                glitchRevertTimeoutId = setTimeout(() => {
                    glitchStripIndex = -1;
                    glitchOffsetX = 0;
                }, GLITCH_DURATION_MS);
            }
            scheduleGlitch();
        }, delay);
    }

    function stopGlitch() {
        if (glitchTimeoutId) { clearTimeout(glitchTimeoutId); glitchTimeoutId = null; }
        if (glitchRevertTimeoutId) { clearTimeout(glitchRevertTimeoutId); glitchRevertTimeoutId = null; }
        glitchStripIndex = -1;
        glitchOffsetX = 0;
    }

    function startIconHologram() {
        if (!iconCanvas || iconRafId) return;
        if (!iconCtx) iconCtx = iconCanvas.getContext('2d');
        iconStripCount = Math.ceil(ICON_RES / ICON_STRIP_H);

        function begin() {
            iconRafId = requestAnimationFrame(drawIconHologramFrame);
            scheduleGlitch();
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
        stopGlitch();
    }

    startIconHologram();

    // ─── Кнопки тайтлбара (свернуть/закрыть) ───────────────────────────────────
    // Каждая кнопка — отдельный <canvas>, состояние нажатия рисуется прямо на канвасе через
    // globalCompositeOperation='source-atop' — затемняющий слой ложится ТОЛЬКО поверх уже
    // нарисованных непрозрачных пикселей спрайта, прозрачный фон кнопки не темнеет.
    const titlebarButtons = [
        { canvas: document.getElementById('titlebar-collapse'), src: '../../assets/img/TASKBAR/COLLAPSE.png', action: () => { if (window.electronAPI) window.electronAPI.minimizeWindow(); } },
        { canvas: document.getElementById('titlebar-close'),    src: '../../assets/img/TASKBAR/CLOSE.png',    action: () => { if (window.electronAPI) window.electronAPI.closeWindow(); } }
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
            stopIconHologram(); // останавливаем rAF-цикл голограммы иконки, пока лаунчер скрыт
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
                top: '50px', // ниже верхних UI-элементов (кнопка настроек и т.д.), чтобы не перекрывать их
                right: '10px',
                zIndex: '999',
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
        updateBadge.textContent = `Update available: ${info.version} (click to download)`;
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
    let launchInProgress = false; // защита от повторных кликов по кнопке сервера
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
            if (launchInProgress) return; // игнорируем повторные клики, пока идёт запуск
            launchInProgress = true;
            serverButtons.forEach(b => b.style.pointerEvents = 'none');

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
            startIconHologram(); // возобновляем голограмму иконки (тонированные канвасы уже закэшированы, пересчёта не будет)

            // Лаунчер снова показан (успех или таймаут запуска) — разрешаем новый клик
            launchInProgress = false;
            serverButtons.forEach(b => b.style.pointerEvents = '');
        });
    }
});
