const GITHUB_REPO = 'PAVUK-LAUNCHERS/pavuk';
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

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

async function fetchLatestRelease() {
    try {
        const data = await fetchWithTimeout(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, FETCH_TIMEOUT_MS);
        const version = String(data.tag_name || '').replace(/^v/i, '');
        if (version) return { version, notes: data.body || '', url: data.html_url };
    } catch (e) {
        console.warn('[update] GitHub Releases недоступен:', e.message);
    }

    return null;
}

async function checkForUpdates(currentVersion, onUpdateAvailable) {
    const remote = await fetchLatestRelease();
    if (!remote || !remote.version) return;
    if (compareVersions(remote.version, currentVersion) > 0) onUpdateAvailable(remote);
}

module.exports = {
    GITHUB_REPO,
    UPDATE_CHECK_INTERVAL_MS,
    compareVersions,
    fetchWithTimeout,
    checkForUpdates
};
