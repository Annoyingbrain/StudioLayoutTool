// GitHub Sync panel: save the current setup as a single JSON file
// (setups/<setup.id>.json, overwritten on every save) to a GitHub repo via
// the Contents API, straight from the browser -- no server involved, same
// as the rest of this static app. The token is only ever kept in this
// browser's local storage.
window.App = window.App || {};

(function () {
  const dom = App.dom;
  const LS_KEY = 'studioLayoutTool.githubSync.v1';

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

  // UTF-8 safe base64 encoding (setup JSON can contain non-ASCII text and
  // already-base64 embedded images inside a JSON string).
  function toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function saveToGitHub() {
    const cfg = readFields();
    if (!cfg.token || !cfg.owner || !cfg.repo) {
      setStatus('Fill in token, owner and repo first.', true);
      return;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));

    const setup = App.Store.getSetup();
    const path = `setups/${setup.id}.json`;
    const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
    const headers = {
      Authorization: `token ${cfg.token}`,
      Accept: 'application/vnd.github+json'
    };

    const btn = dom.qs('#btn-save-github');
    btn.disabled = true;
    setStatus('Saving…');

    try {
      let sha;
      const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(cfg.branch)}`, { headers });
      if (getRes.ok) {
        sha = (await getRes.json()).sha;
      } else if (getRes.status !== 404) {
        throw new Error(`Lookup failed (${getRes.status}): ${await getRes.text()}`);
      }

      const body = {
        message: `Save "${setup.name}" — ${new Date().toISOString()}`,
        content: toBase64(JSON.stringify(setup, null, 2)),
        branch: cfg.branch
      };
      if (sha) body.sha = sha;

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body)
      });
      if (!putRes.ok) throw new Error(`Save failed (${putRes.status}): ${await putRes.text()}`);

      setStatus(`Saved to ${cfg.owner}/${cfg.repo}/${path}`);
      App.toast(`Setup saved to GitHub: ${path}`);
    } catch (err) {
      setStatus(err.message, true);
      App.toast('GitHub save failed: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  App.githubSync = {
    init() {
      populateFields(loadConfig());
      dom.qs('#btn-save-github').addEventListener('click', saveToGitHub);
    }
  };
})();
