// Measurement panel: for the selected prop, pick which point (center or one of
// its 4 corners) you're measuring, enter its real-world tape-measure distances
// to each of the 5 reference points, and solve that point's world position via
// multilateration. Once 2+ of the prop's points have a solved position, the
// prop's overall X/Y and rotation are fit from those points (1 point alone can
// only translate the prop -- its rotation is kept as-is).
window.App = window.App || {};

(function () {
  const dom = App.dom;
  let selectedPointKey = 'center';

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
    App.PROP_POINTS.forEach(({ key, label }) => {
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
        container.appendChild(dom.el('div', { class: 'measure-row' }, [
          dom.el('span', { text: `Dist. to ${rp.label}` }), input
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
    App.PROP_POINTS.forEach(({ key, label }) => {
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

    const solvedCount = App.PROP_POINTS.filter(({ key }) => prop.measuredPoints[key] && prop.measuredPoints[key].solved).length;
    dom.qs('#btn-solve-object').disabled = solvedCount === 0;
  }

  function render() {
    const prop = currentProp();
    const empty = dom.qs('#measurement-empty'), fields = dom.qs('#measurement-fields');
    if (!prop) { empty.classList.remove('hidden'); fields.classList.add('hidden'); return; }
    empty.classList.add('hidden'); fields.classList.remove('hidden');

    renderPointSelector();
    renderDistanceInputs();
    renderPointsStatus();
  }

  function readDistances() {
    return dom.qsa('#measurement-inputs input').map(i => i.value === '' ? null : parseFloat(i.value));
  }

  function compute() {
    const prop = currentProp();
    if (!prop) return;
    const setup = App.Store.getSetup();
    const distances = readDistances();
    const result = App.multilateration.solve(setup.referencePoints, distances);
    const resultEl = dom.qs('#measurement-result');

    if (!result.ok) {
      resultEl.innerHTML = `<span class="err-bad">${result.reason}</span>`;
      App.Store.updateMeasuredPoint(prop.id, selectedPointKey, { distances, solved: null });
      return;
    }

    const errClass = result.rmsError < 0.03 ? 'err-ok' : (result.rmsError < 0.10 ? 'err-warn' : 'err-bad');
    resultEl.innerHTML =
      `X = ${result.x.toFixed(3)} m, Y = ${result.y.toFixed(3)} m<br>` +
      `<span class="${errClass}">Residual error: ${result.rmsError.toFixed(3)} m (from ${result.usedPoints} points)</span>`;

    App.Store.updateMeasuredPoint(prop.id, selectedPointKey, {
      distances,
      solved: { x: result.x, y: result.y, rmsError: result.rmsError }
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
      App.Store.subscribe(render);
      render();
    },
    getSelectedPointKey() { return selectedPointKey; },
    selectPoint
  };
})();
