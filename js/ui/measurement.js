// Measurement panel: for the selected prop, pick which point (center, or for a
// rectangular prop one of its 4 corners) you're measuring, enter its real-world
// distances to each of the 5 reference points, and solve that point's world
// position via multilateration. Once 2+ of the prop's points have a solved
// position, the prop's overall X/Y and rotation are fit from those points (1
// point alone can only translate the prop -- its rotation is kept as-is). A
// circular prop only ever has a center point -- it's rotationally symmetric,
// so its position always comes from that single point.
// Distances can be typed in by hand, or streamed live from a Leica DISTO
// laser meter over Web Bluetooth (see js/disto.js): either click a field and
// take the reading (fills in, advances to the next field -- fast for desktop
// sequential entry), or tap that field's 📡 button to open a "waiting for
// reading" modal targeting just that field (more reliable on touch/mobile,
// where keyboard focus doesn't survive picking up a separate physical
// device). Web Bluetooth doesn't exist on iOS at all (WebKit doesn't
// implement it), so none of this works in Safari or any iPad/iPhone browser.
//
// Raw readings are 3D slant distances, not flat 2D ones -- reference points
// sit on the wall at a fixed height and the tape is read near the prop's own
// height, not the floor -- so they're corrected to horizontal distances
// before solving (see js/heightCorrection.js). The "Tape height above
// object" field sets how far above the prop that reading is actually taken
// (a monopod-mounted DISTO holds this at a known fixed height); it's
// persisted across sessions via App.persistence, independent of the setup
// data. The "Current Distances" cross-check readout does the reverse
// (horizontal -> expected slant) so it matches what a real tape/DISTO
// reading should show.
window.App = window.App || {};

(function () {
  const dom = App.dom;
  let selectedPointKey = 'center';
  let lastFocusedInput = null;
  // Set while the "waiting for reading" modal is open (tap-to-read flow,
  // primarily for touch/mobile where tracking focus across switching to a
  // physical device is unreliable) -- the next DISTO reading fills this
  // specific input instead of whatever has keyboard focus.
  let pendingReadTarget = null;

  function currentProp() { return App.Store.getSelectedProp(); }

  function selectPoint(key) {
    selectedPointKey = key;
    render();
    if (App.canvas) App.canvas.render();
  }

  function renderPointSelector() {
    const container = dom.qs('#point-selector');
    dom.clear(container);
    const prop = currentProp();
    App.propPointsFor(prop).forEach(({ key, label }) => {
      const hasData = prop && prop.measuredPoints[key];
      const btn = dom.el('button', {
        class: 'point-btn tool-btn' + (key === selectedPointKey ? ' active' : '') + (hasData ? ' has-data' : ''),
        text: label,
        onclick: () => selectPoint(key)
      });
      container.appendChild(btn);
    });
  }

  function renderDistanceInputs() {
    const prop = currentProp();
    const setup = App.Store.getSetup();
    const container = dom.qs('#measurement-inputs');
    const tag = prop.id + ':' + selectedPointKey;
    const stored = prop.measuredPoints[selectedPointKey];

    if (container.getAttribute('data-tag') !== tag) {
      dom.clear(container);
      setup.referencePoints.forEach((rp, i) => {
        const input = dom.el('input', { type: 'number', step: '0.001', min: '0', placeholder: 'meters' });
        input.value = stored && stored.distances[i] != null ? stored.distances[i] : '';
        const readBtn = dom.el('button', {
          class: 'disto-read-btn', text: '📏', title: `Read distance to ${rp.label} from DISTO`,
          onclick: (e) => { e.preventDefault(); requestReadingFor(input, rp.label); }
        });
        container.appendChild(dom.el('div', { class: 'measure-row' }, [
          dom.el('span', { text: `Dist. to ${rp.label}` }), input, readBtn
        ]));
      });
      container.setAttribute('data-tag', tag);
      dom.qs('#measurement-result').textContent = '';
    }
  }

  function renderPointsStatus() {
    const prop = currentProp();
    const container = dom.qs('#points-status');
    dom.clear(container);
    App.propPointsFor(prop).forEach(({ key, label }) => {
      const mp = prop.measuredPoints[key];
      const statusText = mp && mp.solved
        ? `solved (±${mp.solved.rmsError.toFixed(3)}m)`
        : (mp ? 'distances entered' : 'not measured');
      const row = dom.el('div', {
        class: 'point-status-row',
        onclick: () => selectPoint(key)
      }, [
        dom.el('span', { class: 'psr-label', text: label }),
        dom.el('span', { class: 'psr-status' + (mp && mp.solved ? ' solved' : ''), text: statusText }),
        mp ? dom.el('button', {
          class: 'psr-clear', text: '✕',
          onclick: (e) => {
            e.stopPropagation();
            if (key === selectedPointKey) dom.qs('#measurement-inputs').removeAttribute('data-tag');
            App.Store.clearMeasuredPoint(prop.id, key);
          }
        }) : null
      ]);
      container.appendChild(row);
    });

    const solvedCount = App.propPointsFor(prop).filter(({ key }) => prop.measuredPoints[key] && prop.measuredPoints[key].solved).length;
    dom.qs('#btn-solve-object').disabled = solvedCount === 0;
  }

  function renderCurrentDistances() {
    const prop = currentProp();
    const setup = App.Store.getSetup();
    const container = dom.qs('#current-distances');
    dom.clear(container);
    const worldPt = App.geometry.pointWorldPosition(prop, selectedPointKey);
    setup.referencePoints.forEach(rp => {
      const horizontal = App.geometry.distance(worldPt.x, worldPt.y, rp.x, rp.y);
      const slant = App.heightCorrection.toSlant(horizontal, prop);
      container.appendChild(dom.el('div', { class: 'dist-row' }, [
        dom.el('span', { class: 'dr-label', text: rp.label }),
        dom.el('span', { class: 'dr-value', text: `${slant.toFixed(3)} m` })
      ]));
    });
  }

  function render() {
    const prop = currentProp();
    const empty = dom.qs('#measurement-empty'), fields = dom.qs('#measurement-fields');
    if (!prop) { empty.classList.remove('hidden'); fields.classList.add('hidden'); return; }
    empty.classList.add('hidden'); fields.classList.remove('hidden');

    // A circular prop only ever exposes 'center' -- if the previously
    // selected prop's point (e.g. a corner) doesn't apply here, fall back.
    if (!App.propPointsFor(prop).some(p => p.key === selectedPointKey)) selectedPointKey = 'center';

    renderPointSelector();
    renderDistanceInputs();
    renderPointsStatus();
    renderCurrentDistances();
  }

  function readDistances() {
    return dom.qsa('#measurement-inputs input').map(i => i.value === '' ? null : parseFloat(i.value));
  }

  function compute() {
    const prop = currentProp();
    if (!prop) return;
    const setup = App.Store.getSetup();
    // Raw tape/DISTO readings are 3D slant distances (reference points are on
    // the wall at a fixed height; the tape is read near the prop's own
    // height, not the floor) -- correct each to the horizontal distance the
    // (floor-plane) multilateration solve actually needs before solving. The
    // raw readings are still what gets persisted, so this recomputes cleanly
    // if the height assumptions ever change.
    const rawDistances = readDistances();
    const distances = rawDistances.map(d => App.heightCorrection.toHorizontal(d, prop));
    const result = App.multilateration.solve(setup.referencePoints, distances);
    const resultEl = dom.qs('#measurement-result');

    if (!result.ok) {
      resultEl.innerHTML = `<span class="err-bad">${result.reason}</span>`;
      App.Store.updateMeasuredPoint(prop.id, selectedPointKey, { distances: rawDistances, solved: null });
      return;
    }

    const errClass = result.rmsError < 0.03 ? 'err-ok' : (result.rmsError < 0.10 ? 'err-warn' : 'err-bad');
    resultEl.innerHTML =
      `X = ${result.x.toFixed(3)} m, Y = ${result.y.toFixed(3)} m<br>` +
      `<span class="${errClass}">Residual error: ${result.rmsError.toFixed(3)} m (from ${result.usedPoints} points)</span>`;

    App.Store.updateMeasuredPoint(prop.id, selectedPointKey, {
      distances: rawDistances,
      solved: { x: result.x, y: result.y, rmsError: result.rmsError }
    });
  }

  // Fills whichever distance input was last focused (falling back to the
  // first empty one) with a live DISTO reading, then advances focus to the
  // next field so a sequence of readings can be tapped in without touching
  // the mouse/keyboard between shots. If the tap-to-read modal is open for a
  // specific field, that field takes priority over focus tracking.
  function handleDistoReading(meters) {
    if (pendingReadTarget) {
      pendingReadTarget.value = meters.toFixed(3);
      pendingReadTarget.dispatchEvent(new Event('input', { bubbles: true }));
      hideDistoWaitModal();
      return;
    }

    const inputs = dom.qsa('#measurement-inputs input');
    if (!inputs.length) return;
    const focusedIdx = lastFocusedInput ? inputs.indexOf(lastFocusedInput) : -1;
    const target = focusedIdx !== -1 ? inputs[focusedIdx] : (inputs.find(i => i.value === '') || inputs[0]);
    target.value = meters.toFixed(3);

    const next = inputs[inputs.indexOf(target) + 1];
    if (next) { next.focus(); lastFocusedInput = next; }
  }

  function showDistoWaitModal(label) {
    dom.qs('#disto-modal-text').textContent = `Waiting for reading to ${label}… take it on the DISTO now.`;
    dom.qs('#disto-wait-modal').classList.remove('hidden');
  }

  function hideDistoWaitModal() {
    pendingReadTarget = null;
    dom.qs('#disto-wait-modal').classList.add('hidden');
  }

  // Tap-to-read: connects the DISTO first if needed (must happen directly
  // inside this click handler -- Web Bluetooth requires a real user gesture,
  // so it can't be deferred behind an intermediate await/prompt), then opens
  // a modal that captures the very next reading into this specific field.
  // Meant mainly for touch/tablet use, where relying on which field still has
  // keyboard focus while the user picks up a separate physical device is
  // unreliable.
  async function requestReadingFor(input, label) {
    if (!App.disto.isSupported()) {
      App.toast('Web Bluetooth isn\'t available in this browser -- use Chrome or Edge, over HTTPS or localhost.', true);
      return;
    }
    if (!App.disto.isConnected()) {
      try {
        await App.disto.connect();
      } catch (err) {
        if (err.name !== 'NotFoundError') App.toast('DISTO connection failed: ' + err.message, true);
        return;
      }
    }
    pendingReadTarget = input;
    showDistoWaitModal(label);
  }

  function updateDistoStatus({ connected, deviceName }) {
    dom.qs('#btn-disto-connect').textContent = connected ? 'Disconnect DISTO' : 'Connect DISTO';
    const status = dom.qs('#disto-status');
    status.textContent = connected ? `Connected: ${deviceName || 'DISTO'}` : 'Not connected';
    status.classList.toggle('err-ok', connected);
  }

  async function toggleDisto(opts) {
    if (!App.disto.isSupported()) {
      App.toast('Web Bluetooth isn\'t available in this browser -- use Chrome or Edge, over HTTPS or localhost.', true);
      return;
    }
    try {
      if (App.disto.isConnected()) {
        App.disto.disconnect();
      } else {
        await App.disto.connect(opts);
        App.toast('DISTO connected.');
      }
    } catch (err) {
      if (err.name !== 'NotFoundError') App.toast('DISTO connection failed: ' + err.message, true);
    }
  }

  function initTapeAboveObjectInput() {
    const input = dom.qs('#tape-above-object-input');
    const stored = App.persistence.loadTapeAboveObjectM();
    if (stored != null) App.heightCorrection.tapeAboveObjectM = stored;
    input.value = App.heightCorrection.tapeAboveObjectM;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (isNaN(v)) return;
      App.heightCorrection.tapeAboveObjectM = v;
      App.persistence.saveTapeAboveObjectM(v);
      if (currentProp()) renderCurrentDistances();
    });
  }

  function solveObject() {
    const prop = currentProp();
    if (!prop) return;
    const result = App.Store.solvePropTransform(prop.id);
    if (!result) { App.toast('Compute at least one point first.', true); return; }
    App.toast(result.pointCount === 1
      ? 'Prop repositioned (rotation kept — measure a 2nd point to solve rotation too).'
      : `Prop position + rotation solved from ${result.pointCount} points (fit residual ${result.fitRms.toFixed(3)}m).`);
  }

  App.measurement = {
    init() {
      dom.qs('#btn-compute-position').addEventListener('click', compute);
      dom.qs('#btn-solve-object').addEventListener('click', solveObject);

      dom.qs('#btn-disto-connect').addEventListener('click', () => toggleDisto());
      dom.qs('#btn-disto-connect-broad').addEventListener('click', () => toggleDisto({ broad: true }));
      dom.qs('#disto-modal-cancel').addEventListener('click', hideDistoWaitModal);
      dom.qs('#measurement-inputs').addEventListener('focusin', e => {
        if (e.target.tagName === 'INPUT') lastFocusedInput = e.target;
      });
      App.disto.onReading(handleDistoReading);
      App.disto.onStatusChange(updateDistoStatus);
      initTapeAboveObjectInput();

      App.Store.subscribe(render);
      render();
    },
    getSelectedPointKey() { return selectedPointKey; },
    selectPoint
  };
})();
