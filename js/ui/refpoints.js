// Reference point (studio survey) panel: 5 fixed points with known real-world X,Y.
window.App = window.App || {};

(function () {
  const dom = App.dom;

  function setVal(el, val) {
    if (document.activeElement === el) return;
    el.value = val;
  }

  function render() {
    const setup = App.Store.getSetup();
    const list = dom.qs('#refpoints-list');

    if (list.children.length !== setup.referencePoints.length) {
      dom.clear(list);
      setup.referencePoints.forEach(rp => {
        const xInput = dom.el('input', { type: 'number', step: '0.001' });
        const yInput = dom.el('input', { type: 'number', step: '0.001' });
        xInput.addEventListener('input', () => App.Store.updateReferencePoint(rp.id, { x: parseFloat(xInput.value) || 0 }));
        yInput.addEventListener('input', () => App.Store.updateReferencePoint(rp.id, { y: parseFloat(yInput.value) || 0 }));
        const row = dom.el('div', { class: 'refpoint-row', 'data-id': rp.id }, [
          dom.el('span', { class: 'rp-label', text: rp.label }),
          xInput, yInput
        ]);
        list.appendChild(row);
      });
    }

    setup.referencePoints.forEach(rp => {
      const row = list.querySelector(`[data-id="${rp.id}"]`);
      if (!row) return;
      const [xInput, yInput] = row.querySelectorAll('input');
      setVal(xInput, rp.x);
      setVal(yInput, rp.y);
    });
  }

  App.refpoints = {
    init() {
      dom.qs('#btn-save-default-refs').addEventListener('click', () => {
        App.persistence.saveDefaultReferencePoints(App.Store.getSetup().referencePoints);
        App.toast('Saved current 5 points as the studio default for new setups.');
      });
      App.Store.subscribe(render);
      render();
    }
  };
})();
