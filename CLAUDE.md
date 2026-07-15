# CLAUDE.md — PAVUK Launcher Suite

> Контекстный файл для LLM. Содержит актуальное описание архитектуры, состояния, IPC-контракта и логики проекта.
> Обновляй этот файл при каждом значимом изменении кода.

---

## Общее описание

Два полностью независимых Electron-лаунчера для BYOND-игр в одном репозитории, с общим `preload.js` и общей папкой `assets/`:

| Лаунчер | Игра | Entry point | Запуск (dev) | Запуск (прод) | Иконка |
|---|---|---|---|---|---|
| **Lifeweb** | Lifeweb II | `main.js` (корень) | `npm start` | `launchers/Lifeweb Launcher.vbs` | `assets/icons/PAVUK.ico` |
| **Scorcher** | Scorcher: The Harmony | `src/scorcher/scorcher_main.js` | `npm run start:scorcher` | `launchers/Scorcher Launcher.vbs` | `assets/icons/SCOROBEY.ico` |

Оба лаунчера используют общий `preload.js` (IPC-мост) из корня проекта, но хранят настройки в разных файлах `%APPDATA%` и собираются в отдельные дистрибутивы (`electron-builder.json` / `electron-builder-scorcher.json`).

---

## Структура проекта (актуальная)

```
PAVUK/
├── .claude/
│   └── settings.local.json
├── _backup/
│   └── create_scorcher_shortcut.ps1.bak   # старый PS1-скрипт создания ярлыка (не используется)
├── dist/                          # Build output (electron-builder), появляется после npm run build
├── assets/                        # ОБЩИЕ ресурсы для обоих лаунчеров
│   ├── icons/
│   │   ├── LOGO.png
│   │   ├── PAVUK.ico             # Иконка Lifeweb (окно, трей, ярлык)
│   │   └── SCOROBEY.ico          # Иконка Scorcher (окно, трей, ярлык)
│   ├── img/
│   │   ├── Back1.png             # Фон лаунчера Lifeweb
│   │   ├── FLASH.mp4             # Случайная вспышка (15–40 сек)
│   │   ├── FLASH01.mp4           # Вспышка при клике на сервер
│   │   ├── LOGO.png              # Логотип Lifeweb (не используется напрямую в index.html — заголовок текстовый)
│   │   ├── Settings/
│   │   │   └── Welcome1.png … Welcome6.png   # Случайный фон окна настроек Lifeweb
│   │   └── Scorcher/
│   │       ├── SCORCHING_MAIN.mp4            # Фоновое видео Scorcher (луп)
│   │       ├── SANDSTORM.mp4                 # Видео при клике на сервер (до конца, блокирует запуск)
│   │       ├── SCORCHER_THE_HARAMONY.png     # Логотип Scorcher
│   │       └── Settings/
│   │           └── marble-bg.png             # Фон окна настроек Scorcher
│   ├── sounds/
│   │   ├── music.mp3             # Фоновая музыка Lifeweb (loop)
│   │   ├── click.MP3             # Звук клика (общий для обоих)
│   │   └── scorcher_music.mp3    # Фоновая музыка Scorcher (loop)
│   └── ttf/
│       └── LinBiolinum.ttf       # Кастомный шрифт (общий, используется в окнах настроек)
├── launchers/
│   ├── Lifeweb Launcher.vbs      # Прод-запуск Lifeweb: создаёт ярлык на раб. столе (1 раз) + electron.exe main.js
│   └── Scorcher Launcher.vbs     # Прод-запуск Scorcher: создаёт ярлык на раб. столе (1 раз) + electron.exe src/scorcher/scorcher_main.js
├── src/
│   ├── pavuk/                    # ── LIFEWEB (frontend) ──
│   │   ├── index.html            # Главное окно Lifeweb
│   │   ├── script.js             # Frontend-логика Lifeweb
│   │   ├── styles.css            # Стили Lifeweb (киберпанк, красно-чёрный)
│   │   └── settings.html         # Окно настроек Lifeweb (инлайн CSS+JS)
│   └── scorcher/                 # ── SCORCHER (frontend + backend) ──
│       ├── scorcher.html         # Главное окно Scorcher
│       ├── scorcher_main.js      # Electron main process — Scorcher (полностью независимый)
│       ├── scorcher_script.js    # Frontend-логика Scorcher
│       ├── scorcher.css          # Стили Scorcher (огненная палитра)
│       └── scorcher_settings.html # Окно настроек Scorcher (инлайн CSS+JS)
├── node_modules/
├── main.js                       # Electron main process — Lifeweb (корень)
├── preload.js                    # contextBridge — общий для обоих лаунчеров
├── package.json
├── package-lock.json
├── electron-builder.json         # Сборка Lifeweb → dist/
├── electron-builder-scorcher.json # Сборка Scorcher → dist-scorcher/
└── reset-shortcuts.bat           # Сброс флагов создания ярлыков на рабочем столе
```

> ⚠️ Пути к ассетам во фронтенде относительные от `src/pavuk/` и `src/scorcher/`, поэтому везде используется префикс `../../assets/...` (например `../../assets/img/Back1.png`).

---

## Запуск и сборка

```bash
# Lifeweb
npm start                          # dev-режим (electron .)
npm run build                      # сборка → dist/ (electron-builder.json)
"launchers/Lifeweb Launcher.vbs"   # прод-запуск без консоли

# Scorcher
npm run start:scorcher             # dev-режим (electron src/scorcher/scorcher_main.js)
npm run build:scorcher             # сборка → dist-scorcher/ (electron-builder-scorcher.json)
"launchers/Scorcher Launcher.vbs"  # прод-запуск без консоли
```

### package.json — scripts
| Скрипт | Команда |
|---|---|
| `start` | `electron .` |
| `start:scorcher` | `electron src/scorcher/scorcher_main.js` |
| `build` | `electron-builder --config electron-builder.json` |
| `build:scorcher` | `electron-builder --config electron-builder-scorcher.json` |

### Зависимости
- `electron`: ^30.0.0
- `electron-builder`: ^24.13.3

### Сборка (electron-builder)
- **Lifeweb** (`electron-builder.json`): `appId: com.lifeweb.launcher`, таргет `portable`, включает `main.js`, `preload.js`, `src/pavuk/**`, `assets/**`, `node_modules/**` → выход в `dist/`.
- **Scorcher** (`electron-builder-scorcher.json`): `appId: com.scorcher.launcher`, таргет `portable`, включает `main.js` (не используется, см. ниже), `preload.js`, `src/scorcher/**`, `assets/**`, `node_modules/**`. `extraMetadata.main` переопределяет точку входа на `src/scorcher/scorcher_main.js` → выход в `dist-scorcher/`.

---

## Создание ярлыков на рабочем столе

Есть **два независимых механизма** создания ярлыков — важно не путать их:

1. **VBS-лаунчеры** (`launchers/*.vbs`) — при первом запуске через .vbs создают ярлык, указывающий **на сам .vbs файл** (`PAVUK.lnk` / `SCOROBEY.lnk`), используя флаг `%APPDATA%\pavuk-shortcut.flag` / `%APPDATA%\scorobey-shortcut.flag`.
2. **`createDesktopShortcut()` в main.js / scorcher_main.js** — при первом запуске Electron-приложения (через PowerShell COM-объект `WScript.Shell`) создаёт ярлык, указывающий на `launchers/*.bat` (файлы `.bat` в репозитории отсутствуют — нужно создать или этот механизм считается legacy/незавершённым), используя отдельный флаг `pavuk-shortcut-created.flag` / `scorobey-shortcut-created.flag` в `userData`.

`reset-shortcuts.bat` в корне — сбрасывает флаги, чтобы ярлыки были созданы повторно (точное содержимое не проверено в рамках этого анализа, см. файл при необходимости).

`_backup/create_scorcher_shortcut.ps1.bak` — старая версия PS1-скрипта создания ярлыка Scorcher, оставлена как референс/бэкап, не используется в коде.

---

## ЛАУНЧЕР 1: LIFEWEB (`main.js` + `src/pavuk/`)

### Базовые пути в main.js
```js
ROOT      = __dirname                         // корень репозитория
ASSETS    = path.join(ROOT, 'assets')
SRC_PAVUK = path.join(ROOT, 'src', 'pavuk')
```

### Состояние (`state` в main.js)

| Поле | Тип | Описание |
|---|---|---|
| `volume` | number | Громкость музыки (0–1), default 0.5 |
| `autoServer` | string | byond:// URL для авто-подключения (пусто = выключено) |
| `autoTime` | string | Время авто-запуска `"HH:MM"`, default `"12:00"` |
| `lastScheduledRun` | string\|null | Защита от дублей авто-подключения |
| `dsPhase` | string | Фаза конечного автомата: `'IDLE'` / `'LAUNCHING'` / `'PLAYING'` |
| `launchDeadline` | number | `Date.now() + 30000` — после этого момента LAUNCHING → IDLE (провал) |

Настройки (`volume`, `autoServer`, `autoTime`) сохраняются в `%APPDATA%/launcher-settings.json`, загружаются при старте через `loadSettingsFromDisk()`.

### Серверы Lifeweb

| ID | URL |
|---|---|
| EU1 | `byond://eu1.lfwb.at:1984` |
| EU2 | `byond://eu2.lfwb.at:1984` |
| EU3 | `byond://eu3.lfwb.at:1984` |

### Дизайн Lifeweb
- Тёмно-красная/чёрная киберпанк-тема.
- Заголовок `LIFEWEB II` — текстовый логотип (`<h1 class="logo-text">`), без картинки.
- Фон: `Back1.png` с parallax на `mousemove` (`scale(1.05)`).
- Scanlines (анимированные) + vignette.
- Случайные вспышки `FLASH.mp4` (интервал 15–40 сек, рекурсивная цепочка через `scheduleNextFlash()`), при клике на сервер — `FLASH01.mp4`.
- Кнопка настроек (шестерёнка, SVG) — `#settings-btn`.
- Окно настроек: случайный фон из 6 картинок `Welcome1–6.png` (`assets/img/Settings/`), блюр+затемнение (`filter: blur(3px) brightness(0.7)`), шрифт `LinBiolinum`.

---

## ЛАУНЧЕР 2: SCORCHER (`src/scorcher/scorcher_main.js`)

### Базовые пути в scorcher_main.js
```js
// __dirname здесь = src/scorcher/, поэтому поднимаемся на 2 уровня
ROOT         = path.resolve(__dirname, '..', '..')
ASSETS       = path.join(ROOT, 'assets')
SRC_SCORCHER = path.join(ROOT, 'src', 'scorcher')
```
`preload.js` подключается по абсолютному пути от `ROOT` (общий с Lifeweb, в корне репозитория).

### Общее

Полностью независимый лаунчер. Никакой связи с `main.js` Lifeweb во время выполнения (раздельные `BrowserWindow`, раздельный трей, раздельные интервалы). Не имеет физики окон.

### Состояние (`state` в scorcher_main.js)

Те же поля что у Lifeweb (`volume`, `autoServer`, `autoTime`, `lastScheduledRun`, `dsPhase`, `launchDeadline`). Настройки сохраняются в **отдельный** файл `%APPDATA%/scorcher-settings.json`.

### Серверы Scorcher

| ID | URL |
|---|---|
| EU1 | `byond://eu1.lfwb.at:1444` |
| EU2 | `byond://eu2.lfwb.at:1444` |
| EU3 | `byond://eu3.lfwb.at:1444` |

### Дизайн Scorcher
- Огненная палитра: `#ff6a00` / `#0d0500`.
- Логотип `SCORCHER_THE_HARAMONY.png` — сверху (`logo-section`), с динамическим зерном через SVG-фильтр `#logo-grain`:
  - `feTurbulence` (fractalNoise) + `feColorMatrix` (нейтрализация к серому) + `feComposite operator="in"` (обрезка шума по альфа-каналу лого) + `feBlend mode="soft-light"`.
  - JS (`initLogoGrain` в `scorcher_script.js`) каждые 55 мс смещает `baseFrequency` синусоидально (амплитуда 0.06, база 0.72) и случайно меняет `seed` — создаёт "дышащее" зерно только по непрозрачным пикселям лого.
- Зернистый фон на canvas `#grain-bg` (`initGrainBg`): случайный grayscale-шум, перерисовка 18 fps.
- Кнопки серверов — снизу слева (`servers-section`), под лого.
- Фон: зацикленное видео `SCORCHING_MAIN.mp4` (`#bg-video`, `autoplay loop muted`).
- При клике на кнопку сервера — `SANDSTORM.mp4` (`#sandstorm-video`) поверх фона; запуск `electronAPI.launchServer(url)` вызывается **только** по событию `onended` видео (т.е. ожидается полное проигрывание).
- Heat-lines вместо scanlines (визуальный эффект марева).
- Окно настроек: фон `marble-bg.png` без блюра (просто `background-image: cover`), heat-lines поверх, авто-серверы с портом `:1444`.
- Трей: иконка `SCOROBEY.ico`, меню **Show Scorcher** + **Quit**.

### Особенность запуска (видео блокирует клиент)

`scorcher_script.js` — при клике на кнопку сервера:
1. Плавное затухание музыки (шаг -0.05 каждые 50 мс, `fadeAudioInterval`).
2. Звук клика (`click.MP3`).
3. `SANDSTORM.mp4` показывается (`classList.add('active')`) и проигрывается с начала.
4. По событию `onended` — `electronAPI.launchServer(url)` вызывается (флаг `sandstormFinished = true`); видео остаётся видимым до `prepare-to-hide`/`window-restored`, который его скрывает и сбрасывает.

Это отличается от Lifeweb, где `FLASH01.mp4` не блокирует запуск — там запуск через `setTimeout(..., 1000)` независимо от видео.

---

## ОБЩИЙ IPC-контракт (`preload.js`)

`preload.js` (в корне репозитория) — единый файл, используется обоими лаунчерами (main.js Lifeweb указывает на него по абсолютному пути `path.join(ROOT, 'preload.js')`, scorcher_main.js — туда же через свой пересчитанный `ROOT`).

### Renderer → Main

| Канал | Тип | Payload | Описание |
|---|---|---|---|
| `save-settings` | on | `{ volume, autoServer, autoTime, physicsEnabled }` (Lifeweb settings.html не шлёт `smartKill`) | Сохраняет настройки (`Object.assign(state, settings)`), пишет на диск, шлёт `auto-info-update` |
| `get-settings` | handle | — | Возвращает `{ volume, autoServer, autoTime, smartKill, physicsEnabled }` |
| `open-settings` | on | — | Открывает окно настроек |
| `set-volume` | on | `number` | Обновляет громкость, шлёт `update-volume` в mainWindow |
| `hide-window` | on | — | Скрывает лаунчер |
| `launch-server` | on | `string` (byond:// URL) | Запускает DreamSeeker |
| `get-auto-info` | handle | — | `{ server, time }` или `null` |

### Main → Renderer

| Канал | Payload | Описание |
|---|---|---|
| `status-update` | `string` | Текст статуса / пустая строка = скрыть |
| `auto-info-update` | `{ server, time }` | Обновить отображение авто-подключения |
| `update-volume` | `number` | Применить новую громкость |
| `prepare-to-hide` | — | Остановить аудио/видео перед скрытием |
| `window-restored` | `number` (volume) | Восстановить медиа с плавным fade-in |

### exposeInMainWorld API (`window.electronAPI`)
`platform`, `hideWindow()`, `onRestore(cb)`, `onPrepareHide(cb)`, `openSettings()`, `launchServer(url)`, `setVolume(v)`, `onVolumeUpdate(cb)`, `onStatusUpdate(cb)`, `onAutoInfoUpdate(cb)`, `getAutoInfo()`, `saveSettings(s)`, `getSettings()`.
Каждый `on*` подписчик предварительно делает `removeAllListeners` на свой канал — защита от дублирования подписок при повторных вызовах.

---

## ОБЩАЯ ЛОГИКА (обоих main-процессах, идентичный код)

### `isDreamSeekerRunning(callback)`
- `tasklist /FI "IMAGENAME eq dreamseeker.exe" /NH /FO CSV`
- Возвращает `true` если строка `dreamseeker.exe` есть в выводе.

### `launchDreamSeeker(url, statusText)` — единственная точка входа для запуска DS (`async`)
- Охраняется: если `dsPhase === 'LAUNCHING'` — игнорирует повторный вызов (защита от даблклика).
- Устанавливает `dsPhase = 'LAUNCHING'`, `launchDeadline = Date.now() + LAUNCH_GRACE_MS (30с)`, шлёт статус.
- **Строго последовательно**, с ожиданием через `await`, без гонок:
  1. `await killDreamSeeker()` — `taskkill /F /IM dreamseeker.exe /T`, обёрнутый в `Promise`; функция **дожидается** завершения процесса убийства, прежде чем продолжить (не fire-and-forget). Ошибка "process not found" — нормальный случай, игнорируется.
  2. `shell.openExternal(url)` — открывает `byond://`, ОС запускает DreamSeeker сам.
  3. `hideLauncher()` — скрывает лаунчер.
- Обёртки: `handleManualLaunch(url)` / `handleAutoLaunch(url)` — вызывают `launchDreamSeeker` с нужным статусом.
- `smartKill` полностью удалён — `killDreamSeeker()` всегда убивает **все** процессы `dreamseeker.exe` без разбора зомби/здоровых.

### `processMonitorTask()` (каждые `MONITOR_INTERVAL_MS` = 2 сек) — конечный автомат
```
IDLE      → (кнопка сервера)        → LAUNCHING
LAUNCHING → (DS появился в tasklist) → PLAYING  (sendStatus(''))
LAUNCHING → (deadline истёк, 30с)     → IDLE + showLauncher()
PLAYING   → (DS исчез из tasklist)  → IDLE + showLauncher()
```
- В фазе `IDLE` монитор ничего не делает (есть подстраховка: если `isHidden === true`, а `dsPhase === IDLE` — вызывает `showLauncher()`, на случай рассинхрона состояний).
- В фазе `LAUNCHING` ждёт появления DS или истечения дедлайна.
- В фазе `PLAYING` ждёт исчезновения DS и **именно это** возвращает лаунчер на экран при закрытии игры — раньше здесь была причина бага "лаунчер не открывается после закрытия игры" (рассинхрон isLaunching/launchTimer/smartKill в старой системе); сейчас единственный источник истины — `dsPhase`, и переход `PLAYING → IDLE` гарантированно вызывает `showLauncher()`.
- `isDreamSeekerRunning()` и `killDreamSeeker()` оба возвращают `Promise` (не callback) — упрощает последовательную логику и убирает вложенные колбэки.

### `timeBasedAutoConnectTask()` (каждые 10 сек)
- Пропускает, если `autoServer` пуст, лаунчер скрыт, или уже идёт запуск.
- Сравнивает текущее `HH:MM` с `state.autoTime`; срабатывает раз в минуту благодаря `lastScheduledRun`.
- Если совпало и нет уже здорового DreamSeeker — убивает зомби, запускает `state.autoServer`, скрывает лаунчер, статус `AUTO-CONNECTING...`.

### `hideLauncher()` / `showLauncher()`
- `hide`: шлёт `prepare-to-hide` в renderer (даёт фронту время остановить медиа), скрывает окно настроек (если открыто) и главное окно, `isHidden = true`.
- `show`: показывает оба окна, `isHidden = false`, шлёт `window-restored` с текущей громкостью, очищает статус (`sendStatus('')`).

### `createDesktopShortcut()` (различия Lifeweb/Scorcher)
- Выполняется один раз при `app.whenReady()`, проверка через флаг-файл в `userData` (`pavuk-shortcut-created.flag` / `scorobey-shortcut-created.flag`).
- Генерирует временный `.ps1` во `app.getPath('temp')`, создающий `.lnk` через COM `WScript.Shell`, указывающий на `launchers/Lifeweb Launcher.bat` / `launchers/Scorcher Launcher.bat` (эти `.bat`-файлы в репозитории отсутствуют на момент анализа — см. раздел "Создание ярлыков" выше).
- Выполняет `.ps1` через `powershell -NoProfile -ExecutionPolicy Bypass -File`, удаляет временный файл после.

---

## Размеры и позиционирование окон

| Окно | Размер | Lifeweb | Scorcher |
|---|---|---|---|
| Main | 900 × 700 px (`resizable: false`) | да | да |
| Settings | 400 × 300 px (`resizable: false`) | да | да |

Окно настроек открывается по `mainBounds.x - 420, mainBounds.y + 200`, `parent: mainWindow`, модально не блокирует (обычное child-окно). Оба окна `frame: true`, `useContentSize: true`, `contextIsolation: true`, `nodeIntegration: false`.

`webContents.setWindowOpenHandler` в обоих main-процессах перехватывает попытки открыть `byond://` ссылки через `window.open`/обычную навигацию (на случай если ссылка инициируется не через IPC) и роутит их в `handleManualLaunch`/`handleLaunch`, остальные URL — `{ action: 'allow' }`.

---

## Фоновые задачи

| Задача | Интервал | Lifeweb | Scorcher |
|---|---|---|---|
| Мониторинг процессов (`processMonitorTask`) | 3 сек | да | да |
| Авто-подключение (`timeBasedAutoConnectTask`) | 10 сек | да | да |

---

## Frontend-логика (общие паттерны `script.js` / `scorcher_script.js`)

### Аудио
- Запускается на первый `mousemove` или `click` (`{ once: true }`) — обход autoplay-блокировки браузера/Electron.
- Клик по серверу: плавное затухание (шаг -0.05 каждые 50 мс).
- `window-restored`: пауза + сброс времени, затем плавное нарастание громкости с 0 до целевой (шаг +0.03 каждые 40 мс).
- `prepare-to-hide`: резкая остановка музыки и видео, сброс таймеров (таймеры вспышек, `fadeAudioInterval`).

### UI-элементы (одинаковые id в обоих лаунчерах)
- `#status-text` — `CONNECTING...` / `AUTO-CONNECTING...`, скрывается при пустой строке.
- `#auto-connect-info` — `AUTO-CONNECT: <SERVER> @ <HH:MM>` (имя сервера парсится из URL, у Lifeweb отрезается `:1984`, у Scorcher — `:1444`).
- `#weekend-timer` — обратный отсчёт до пятницы 18:00 (показ до субботы 03:00 — `"The show has already started!"` красным/оранжевым); обновляется каждую секунду.
- `#settings-btn` — кнопка-шестерёнка (одинаковый inline SVG в обоих html), открывает окно настроек.

### Различия Lifeweb vs Scorcher во фронтенде
| | Lifeweb | Scorcher |
|---|---|---|
| Парallax фона | `mousemove` → `translate + scale(1.05)` на `.background-container` | нет (фон — статичное видео) |
| Видео-эффекты | `FLASH.mp4` случайно (15–40 сек, не блокирует), `FLASH01.mp4` на клик (не блокирует запуск) | `SANDSTORM.mp4` на клик сервера — **блокирует** запуск до `onended` |
| Доп. визуальные эффекты | scanlines + vignette (CSS) | canvas-шум `#grain-bg` (18 fps), SVG-зерно на лого (`feTurbulence`, обновление каждые 55 мс), heat-lines |
| Логотип | текстовый `<h1>LIFEWEB II</h1>` | картинка `SCORCHER_THE_HARAMONY.png` с зернистым свечением |

---

## Системный трей

- Создаётся при старте (`createTray`), иконка своя для каждого лаунчера.
- Lifeweb: меню **Show Launcher** → `showLauncher()`, **Quit** → `app.quit()`.
- Scorcher: меню **Show Scorcher** → `showLauncher()`, **Quit** → `app.quit()`.
- Двойной клик по иконке трея → `showLauncher()` (оба).

---

## Окна настроек — общая логика (settings.html / scorcher_settings.html)

Обе страницы — самодостаточные HTML-файлы с инлайн `<style>` и `<script>` (не подключают внешние JS-файлы).

- Поля: volume slider (0–100%), auto-server select (DISABLED + 3 сервера), auto-time (`<input type="time">`, скрыт если auto-server == DISABLED).
- При загрузке (`loadSettings()`) — запрашивает `electronAPI.getSettings()` и заполняет поля.
- Каждое изменение немедленно вызывает `save()` → `electronAPI.saveSettings({...})` + `electronAPI.setVolume(...)` — нет отдельной кнопки "Сохранить", всё реактивно.
- Lifeweb settings.html дополнительно выбирает случайный фон из 6 картинок (`Welcome1–6.png`) при каждой загрузке окна.
- Scorcher settings.html использует статичный фон `marble-bg.png` (без рандома).
- **Важно**: оба `save()` не передают `smartKill` в payload — это поле управляется только программно/значением по умолчанию (`true`), в UI редактирования нет. Поле `physicsEnabled` полностью удалено из обоих лаунчеров.

---

## Известные особенности / технический долг

- `electron-builder-scorcher.json` указывает `files: ["main.js", ...]`, хотя Scorcher использует `src/scorcher/scorcher_main.js` (переопределяется через `extraMetadata.main`) — `main.js` Lifeweb физически попадает в сборку Scorcher, но не используется как entry point.
- `createDesktopShortcut()` в обоих main-процессах ссылается на `launchers/*.bat`, которых нет в репозитории (есть только `.vbs`) — функция либо упадёт с ошибкой PowerShell, либо создаст нерабочий ярлык, пока `.bat`-файлы не добавлены.
- `timeBasedAutoConnectTask()` в обоих лаунчерах не делает раздельной ветки smartKill/non-smartKill (в отличие от ручного запуска) — всегда идёт по пути "убить зомби по списку", полагаясь на `analyzeProcesses`. *(Примечание: это устаревший пункт от старой системы smartKill, которая полностью удалена — см. раздел про `dsPhase` выше; актуальной проблемы здесь больше нет.)*

---

## ОПТИМИЗАЦИЯ ПАМЯТИ В ФОНЕ (актуально для обоих лаунчеров)

> Известная проблема была исправлена. Раньше при `mainWindow.hide()` Electron НЕ останавливал JS-таймеры, видео и canvas-анимации внутри скрытого renderer-процесса — они продолжали работать на полной скорости в фоне, потребляя ~200MB RAM и CPU даже когда лаунчер был не виден (запущена игра). Теперь все тяжёлые фоновые эффекты явно останавливаются на `prepare-to-hide` и возобновляются на `window-restored`.

### Lifeweb (`script.js`)
- `weekend-timer` (`setInterval(updateWeekendTimer, 1000)`) — обёрнут в `startWeekendTimer()`/`stopWeekendTimer()`, останавливается на `onPrepareHide`, возобновляется на `onRestore`.
- Flash-вспышки (`scheduleNextFlash` / `flashTimeoutId`) — уже останавливались на `onPrepareHide` и раньше, поведение сохранено без изменений.

### Scorcher (`scorcher_script.js`) — основной источник 200MB
Три независимых тяжёлых эффекта раньше работали **бесконечно**, включая когда окно скрыто:
1. **`bg-video`** (`SCORCHING_MAIN.mp4`, `autoplay loop`) — раньше никогда не ставился на паузу при скрытии окна, продолжал декодироваться в фоне. Теперь `pauseBgVideo()`/`resumeBgVideo()` вызывается в `stopHeavyEffects()`/`startHeavyEffects()`.
2. **Canvas-шум `#grain-bg`** (`initGrainBg`, 18 fps, `createImageData` на весь экран каждый тик) — раньше запускался один раз через самовызывающуюся функцию и работал вечно. Теперь обёрнут в `startGrainBg()`/`stopGrainBg()`.
3. **SVG-зерно на лого** (`feTurbulence`, обновление каждые 55 мс) — раньше тоже работал вечно. Теперь обёрнут в `startLogoGrain()`/`stopLogoGrain()`.

Все три эффекта объединены в `startHeavyEffects()` / `stopHeavyEffects()`, вызываемые из `onPrepareHide` / `onRestore` соответственно. `weekend-timer` Scorcher также останавливается/возобновляется аналогично Lifeweb.

Sandstorm-видео (`sandstorm-video`) и так уже корректно паузилось в `onPrepareHide` — без изменений.

---

## ПЕРЕКЛЮЧЕНИЕ СООБЩЕСТВА (RU/KZ) И US-СЕРВЕР (актуально для обоих лаунчеров)

> В настройках обоих лаунчеров добавлен переключатель "WHICH PART OF THE COMMUNITY" — две кнопки-флага: 🇷🇺 RUSSIAN (по умолчанию) и 🇰🇿 ENGLISH (вместо ожидаемого флага США использован флаг Казахстана). Переключатель меняет **порт** у всех кнопок серверов на главном экране, host остаётся прежним (`eu1/eu2/eu3/us`.lfwb.at).

### Порты по регионам
| Лаунчер | RU (по умолчанию) | KZ / INTERZONE |
|---|---|---|
| **Lifeweb** | `1984` | `1923` |
| **Scorcher** | `1444` | `1441` (Alpha) / `1414` (Beta) — выбор через доп. select "SERVER", видимый только при KZ |

### Флаги в настройках
Вместо emoji-флагов используются картинки `assets/icons/ruzone.png` (RUZONE) и `assets/icons/izone.png` (INTERZONE).

### Окно показа weekend-таймера по регионам
Расписание таймера теперь зависит от выбранного `community` (`getWeekendSchedule()` в `script.js`/`scorcher_script.js`):

| Лаунчер | RU (МСК) | KZ / INTERZONE (GMT) |
|---|---|---|
| **Lifeweb** | суббота 11:00 → понедельник 00:00 | пятница 15:00 → воскресенье 00:00 |
| **Scorcher** | пятница 18:00 → суббота 02:00 | воскресенье 15:00 → понедельник 00:00 |

> ⚠️ Scorcher KZ: конец окна (понедельник 00:00 GMT) — предположение по аналогии с RU-расписанием (точное время окончания не было уточнено техзаданием, при необходимости скорректировать `getWeekendSchedule()` в `scorcher_script.js`). Таймер пересчитывается сразу при смене региона в настройках (через `servers-config-update`), без перезапуска.

### US-сервер
В обоих лаунчерах на главном экране и в списке авто-подключения добавлена 4-я кнопка/опция `US` → `us.lfwb.at` (порт зависит от текущего региона, как и у EU-серверов).

### Реализация
- **Состояние** (`main.js` / `scorcher_main.js`): добавлено поле `community` (`'ru'` / `'kz'`, default `'ru'`), у Scorcher дополнительно `scorcherRegion` (`'alpha'` / `'beta'`, default `'alpha'`, значимо только при `community === 'kz'`). Оба поля сохраняются в `%APPDATA%/*-settings.json` и загружаются при старте.
- **IPC**: `save-settings`/`get-settings` расширены этими полями. Добавлен новый канал **`servers-config-update`** (main → renderer), рассылаемый при сохранении настроек и при `did-finish-load`, содержит `{ community }` (Lifeweb) / `{ community, scorcherRegion }` (Scorcher). `preload.js` экспонирует `onServersConfigUpdate(cb)`.
- **Главный экран** (`script.js` / `scorcher_script.js`): при загрузке запрашивает `getSettings()` и вызывает `updateServerPorts()`, которая проходит по `.server-button` и переписывает порт в `data-server` через regex `/:\d+$/`. Также подписан на `onServersConfigUpdate` для живого обновления портов без перезапуска, если настройки меняются пока лаунчер открыт. Парсинг имени сервера для `#auto-connect-info` тоже переведён на `/:\d+$/` (раньше было жёстко зашито `:1984`/`:1444`).
- **Окно настроек** (`settings.html` / `scorcher_settings.html`): флаги-кнопки `.flag-btn` с классом `.active` на выбранном; список `#auto-server` (AUTO-CONNECT TARGET) перестраивается функцией `rebuildAutoServerOptions()` под текущий регион/сервер, с попыткой сохранить выбранный host при смене порта. У Scorcher дополнительно блок `#region-server-container` (select Alpha/Beta) — скрыт через класс `.hidden`, показывается только при `community === 'kz'`.

---

## РАСЧЁТ ВРЕМЕНИ ПО МСК (weekend-timer, актуально для обоих лаунчеров)

> Баг исправлен. Раньше `weekend-timer` считался по локальному времени компьютера пользователя (`new Date().getDay()/getHours()`), из-за чего окно показа "PARTY HARD" / "The show has already started!" срабатывало в разное время суток для разных часовых поясов. Теперь расчёт всегда идёт по московскому времени через `Intl.DateTimeFormat({ timeZone: 'Europe/Moscow' })` и автоматически адаптируется к любому локальному часовому поясу компьютера (включая переходы на летнее/зимнее время — `Intl` сам учитывает правила таймзоны).

### Окна показа (по МСК)
| Лаунчер | Начало | Конец | Текст в `#weekend-timer` |
|---|---|---|---|
| **Lifeweb** | Суббота 11:00 МСК | Понедельник 00:00 МСК | `PARTY HARD` |
| **Scorcher** | Пятница 18:00 МСК | Суббота 02:00 МСК | `The show has already started!` |

### Реализация (`getMoscowParts()` в `script.js` / `scorcher_script.js`)
- `Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })` — возвращает день недели/часы/минуты/секунды именно в МСК, независимо от системной таймзоны компьютера.
- Сравнение времени ведётся в "минутах с начала недели" (`day * 1440 + hour * 60 + minute`), что упрощает обработку перехода через границу недели (например, Lifeweb: суббота → воскресенье → понедельник).
- Отсчёт до начала окна показа считается в МСК-секундах и просто рендерится как `Nd Nh Nm Ns` — выводимые цифры одинаковы для всех пользователей независимо от их локального часового пояса (они показывают, сколько осталось по факту, а не "который час у меня").
- `weekend-timer` для каждого лаунчера также подключён к экономии памяти (см. раздел выше) — таймер не крутится, пока окно скрыто.

---

## Система уведомлений об обновлениях + публикация на GitHub

Подробное описание архитектуры, роутов и TODO — в `CLAUDE.md` проекта `PAVUK_BACKEND` (там живёт `/api/version` и сам RAR). Коротко:

- **Архитектура**: бэкенд — основной источник версии (`GET /api/version`), GitHub Releases — fallback. Только мягкое уведомление, без принудительной блокировки запуска.
- **Дистрибутив**: оба лаунчера в одном RAR без установщика — версия одна общая для Lifeweb и Scorcher, берётся из `package.json` (`app.getVersion()`).
- `main.js` / `scorcher_main.js`: функция `checkForUpdates()` (проверка при старте + каждые 4 часа), `compareVersions()`, IPC `open-external-url` (только http/https).
- `preload.js` (общий для обоих окон): `onUpdateAvailable(cb)`, `openExternalUrl(url)`.
- `script.js` / `scorcher_script.js`: бейдж `#update-badge` в углу экрана (создаётся динамически через JS, без правки HTML/CSS), клик открывает ссылку скачивания.

### ⚠️ TODO перед реальным релизом (важно!)
В `main.js` и `src/scorcher/scorcher_main.js` сейчас стоят **плейсхолдеры**:
```js
const BACKEND_URL = 'https://REPLACE_ME.onrender.com';
const GITHUB_REPO = 'REPLACE_ME/REPLACE_ME';
```
Заменить на реальные значения после деплоя бэкенда и создания публичного репозитория, иначе проверка обновлений просто будет тихо падать в catch и ничего не показывать. Также не забывать повышать `"version"` в корневом `package.json` перед каждым релизом.
