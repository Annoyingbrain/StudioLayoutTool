// GitHub Sync panel: save the current setup (all its scenes, props, frame
// grabs, reference points) as one JSON file (setups/<setup.id>.json,
// overwritten on every save) to a GitHub repo via the Contents API, straight
// from the browser -- no server involved, same as the rest of this static
// app. A small setups/index.json manifest ({id, name, updatedAt}[]) is kept
// alongside so the app can list/load setups without fetching every file.
// The token is only ever kept in this browser's local storage.
window.App = window.App || {};

(function () {
  const dom = App.dom;
  const LS_KEY = 'studioLayoutTool.githubSync.v1';
  const INDEX_PATH = 'setups/index.json';

  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function readFields() {
    return {
      token: dom.qs('#gh-token').value.trim(),
      owner: dom.qs('#gh-owner').value.trim(),
      repo: dom.qs('#gh-repo').value.trim(),
      branch: dom.qs('#gh-branch').value.trim() || 'main'
    };
  }

  function populateFields(cfg) {
    dom.qs('#gh-token').value = cfg.token || '';
    dom.qs('#gh-owner').value = cfg.owner || '';
    dom.qs('#gh-repo').value = cfg.repo || '';
    dom.qs('#gh-branch').value = cfg.branch || 'main';
  }

  function setStatus(text, isError) {
    const el = dom.qs('#gh-status');
    el.textContent = text;
    el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  }

  // UTF-8 safe base64 encode/decode (setup JSON can contain non-ASCII text
  // and already-base64 embedded images inside a JSON string).
  function toBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function fromBase64(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }

  function authHeaders(cfg) {
    return { Authorization: `token ${cfg.token}`, Accept: 'application/vnd.github+json' };
  }

  function contentsUrl(cfg, path) {
    return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  }

  // Returns { sha, data } for a JSON file in the repo, or { sha: null, data: null } if it doesn't exist yet.
  async function fetchJsonFile(cfg, path) {
    const res = await fetch(`${contentsUrl(cfg, path)}?ref=${encodeURIComponent(cfg.branch)}`, { headers: authHeaders(cfg) });
    if (res.status === 404) return { sha: null, data: null };
    if (!res.ok) throw new Error(`Fetch of ${path} failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    return { sha: json.sha, data: JSON.parse(fromBase64(json.content)) };
  }

  async function putJsonFile(cfg, path, data, sha, message) {
    const body = { message, content: toBase64(JSON.stringify(data, null, 2)), branch: cfg.branch };
    if (sha) body.sha = sha;
    const res = await fetch(contentsUrl(cfg, path), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(cfg)),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Save of ${path} failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  function configReady(cfg) { return !!(cfg.token && cfg.owner && cfg.repo); }

  async function saveToGitHub() {
    const cfg = readFields();
    if (!configReady(cfg)) {
      setStatus('Fill in token, owner and repo first.', true);
      return;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));

    const setup = App.Store.getSetup();
    const path = `setups/${setup.id}.json`;

    const btn = dom.qs('#btn-save-github');
    btn.disabled = true;
    setStatus('Saving…');

    try {
      const existing = await fetchJsonFile(cfg, path);
      await putJsonFile(cfg, path, setup, existing.sha, `Save "${setup.name}" — ${new Date().toISOString()}`);

      // Keep the index manifest in sync so the Load list stays accurate.
      const indexFile = await fetchJsonFile(cfg, INDEX_PATH);
      const index = Array.isArray(indexFile.data) ? indexFile.data : [];
      const entry = { id: setup.id, name: setup.name, updatedAt: setup.updatedAt, sceneCount: setup.scenes.length };
      const next = [entry, ...index.filter(e => e.id !== setup.id)];
      await putJsonFile(cfg, INDEX_PATH, next, indexFile.sha, `Update setups index — ${setup.name}`);

      setStatus(`Saved to ${cfg.owner}/${cfg.repo}/${path}`);
      App.toast(`Setup saved to GitHub: ${path}`);
      await refreshLoadList(cfg);
    } catch (err) {
      setStatus(err.message, true);
      App.toast('GitHub save failed: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  async function refreshLoadList(cfg) {
    cfg = cfg || readFields();
    const picker = dom.qs('#gh-load-picker');
    if (!configReady(cfg)) return;
    try {
      const { data } = await fetchJsonFile(cfg, INDEX_PATH);
      const entries = Array.isArray(data) ? data : [];
      entries.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      dom.clear(picker);
      picker.appendChild(dom.el('option', { value: '', text: entries.length ? 'Load setup from GitHub…' : 'No saved setups yet' }));
      entries.forEach(e => {
        const when = e.updatedAt ? new Date(e.updatedAt).toLocaleString() : '';
        picker.appendChild(dom.el('option', { value: e.id, text: `${e.name} (${e.sceneCount || 1} scene${e.sceneCount === 1 ? '' : 's'}) — ${when}` }));
      });
    } catch (err) {
      setStatus('Could not refresh list: ' + err.message, true);
    }
  }

  async function loadFromGitHub(id) {
    if (!id) return;
    const cfg = readFields();
    if (!configReady(cfg)) {
      setStatus('Fill in token, owner and repo first.', true);
      return;
    }
    setStatus('Loading…');
    try {
      const { data } = await fetchJsonFile(cfg, `setups/${id}.json`);
      if (!data) throw new Error('That setup file no longer exists in the repo.');
      App.Store.setSetup(migrateSetup(data));
      setStatus(`Loaded "${data.name}" from GitHub.`);
      App.toast(`Loaded "${data.name}" from GitHub.`);
    } catch (err) {
      setStatus(err.message, true);
      App.toast('GitHub load failed: ' + err.message, true);
    }
  }

  App.githubSync = {
    init() {
      const cfg = loadConfig();
      populateFields(cfg);
      dom.qs('#btn-save-github').addEventListener('click', saveToGitHub);
      dom.qs('#btn-refresh-github-list').addEventListener('click', () => refreshLoadList());
      dom.qs('#gh-load-picker').addEventListener('change', e => loadFromGitHub(e.target.value));
      if (configReady(cfg)) refreshLoadList(cfg);
    }
  };
})();
