// ─── Мониторинг процесса dreamseeker.exe через постоянный PowerShell-процесс ───
//
// История: раньше опрос шёл через `powershell -Command "Get-CimInstance ..."` —
// каждый вызов грузил полный CLR-хост PowerShell заново. При интервале 2с это
// 1800+ холодных стартов в час, за игровую сессию 3-4ч — 5000-7000, и это давало
// нарастающую деградацию (задержка 10-15с перед показом лаунчера).
// Переход на wmic решал проблему холодного старта, но wmic.exe физически удалён
// из чистых установок Windows 11 24H2+ (Microsoft KB5067470) и продолжит выпиливаться
// дальше — опираться на него в новом коде уже нельзя.
//
// Решение: один PowerShell-процесс, поднятый один раз при старте лаунчера и живущий
// всё время работы приложения. Команды пишутся в его stdin, результат читается из
// stdout по уникальному текстовому маркеру конца ответа. CLR грузится один раз за
// весь сеанс, а не на каждый тик — источник данных при этом остаётся официальный
// (Get-CimInstance Win32_Process), а не выпиливаемый wmic.

const { spawn, exec } = require('child_process');

const SENTINEL = '__DS_MON_END_' + Math.random().toString(36).slice(2) + '__';
const COMMAND_TIMEOUT_MS = 4000;

let psProc = null;
let stdoutBuffer = '';
const pendingQueue = [];

function startPowerShellHost() {
    if (psProc && !psProc.killed) return;

    psProc = spawn('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

    stdoutBuffer = '';

    psProc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        let idx;
        while ((idx = stdoutBuffer.indexOf(SENTINEL)) !== -1) {
            const out = stdoutBuffer.slice(0, idx);
            stdoutBuffer = stdoutBuffer.slice(idx + SENTINEL.length);
            const job = pendingQueue.shift();
            if (job) job.resolve(out.trim());
        }
    });

    // stderr отдельных команд не критичен для мониторинга — просто проглатываем,
    // чтобы не засорять консоль и не мешать парсингу stdout.
    psProc.stderr.on('data', () => {});

    const onDeath = (err) => {
        const deathErr = err || new Error('powershell host process exited');
        while (pendingQueue.length) pendingQueue.shift().reject(deathErr);
        psProc = null;
    };
    psProc.on('exit', () => onDeath());
    psProc.on('error', (e) => onDeath(e));
}

function runPsCommand(cmd, timeoutMs = COMMAND_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        startPowerShellHost();

        const job = { resolve: null, reject: null };
        const timer = setTimeout(() => {
            const i = pendingQueue.indexOf(job);
            if (i !== -1) pendingQueue.splice(i, 1);
            reject(new Error('powershell command timeout'));
        }, timeoutMs);

        job.resolve = (v) => { clearTimeout(timer); resolve(v); };
        job.reject  = (e) => { clearTimeout(timer); reject(e); };
        pendingQueue.push(job);

        try {
            psProc.stdin.write(cmd + `; Write-Output '${SENTINEL}'` + '\n');
        } catch (e) {
            clearTimeout(timer);
            const i = pendingQueue.indexOf(job);
            if (i !== -1) pendingQueue.splice(i, 1);
            reject(e);
        }
    });
}

// ─── Проверка наличия живого DreamSeeker ───────────────────────────────────────
async function isDreamSeekerRunning() {
    const cmd = "Get-CimInstance Win32_Process -Filter \"Name='dreamseeker.exe'\" | " +
                "Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress";
    try {
        const out = await runPsCommand(cmd);
        if (!out) return { running: false, hasChild: false };

        let data;
        try { data = JSON.parse(out); } catch (_) { return { running: false, hasChild: false }; }

        const list = Array.isArray(data) ? data : [data];
        const pids  = new Set(list.map(p => p.ProcessId).filter(v => typeof v === 'number'));
        const ppids = new Set(list.map(p => p.ParentProcessId).filter(v => typeof v === 'number'));
        if (pids.size === 0) return { running: false, hasChild: false };

        let hasChild = false;
        for (const pid of pids) { if (ppids.has(pid)) { hasChild = true; break; } }
        return { running: true, hasChild };
    } catch (e) {
        // Хост упал/завис/таймаут — не роняем мониторинг, следующий тик запустит хост заново
        console.error('[ds-monitor] Опрос процессов не удался:', e.message);
        return { running: false, hasChild: false };
    }
}

// ─── Убить все процессы DreamSeeker (ждём завершения) ──────────────────────────
function killDreamSeeker() {
    return new Promise((resolve) => {
        exec('taskkill /F /IM dreamseeker.exe /T', () => resolve());
    });
}

// ─── Остановка постоянного PowerShell-хоста (вызывать на app 'will-quit') ──────
function stopMonitor() {
    if (psProc && !psProc.killed) {
        try { psProc.stdin.end(); } catch (_) {}
        try { psProc.kill(); } catch (_) {}
    }
    psProc = null;
}

module.exports = { isDreamSeekerRunning, killDreamSeeker, stopMonitor };
