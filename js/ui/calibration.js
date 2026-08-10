// Background reference image import + 2-click scale calibration.
// Workflow: import an image (top-down studio photo, mesh render, or frame grab used
// as a floor reference) -> click two points on it that span a known real-world
// distance -> type that distance -> the image is rescaled so 1 world meter matches.
window.App = window.App || {};

(function () {
  const dom = App.dom;
  let picking = false;
  let pickedScreen = [];
  let pickedImagePx = [];

  function backgroundToImagePx(background, worldPt) {
    return {
      x: (worldPt.x - background.originWorld.x) * background.pxPerMeter,
      y: (background.originWorld.y - worldPt.y) * background.pxPerMeter
    };
  }

  async function importImage(file) {
    const dataUrl = await dom.readFileAsDataUrl(file);
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    App.Store.setBackground({
      imageDataUrl: dataUrl,
      pxWidth: dims.w,
      pxHeight: dims.h,
      pxPerMeter: 100, // placeholder until calibrated
      originWorld: { x: 0, y: 0 }
    });
    updateBgInfo();
  }

  function updateBgInfo() {
    const bg = App.Store.getSetup().background;
    dom.qs('#bg-info').textContent = bg
      ? `${bg.pxWidth}x${bg.pxHeight}px · ${bg.pxPerMeter.toFixed(1)} px/m`
      : 'No background image loaded.';
    dom.qs('#btn-calibrate').disabled = !bg;
    dom.qs('#btn-clear-bg').disabled = !bg;
  }

  function start() {
    const bg = App.Store.getSetup().background;
    if (!bg) return;
    picking = true;
    pickedScreen = [];
    pickedImagePx = [];
    App.canvas.render();
  }

  function pick(screen, world) {
    const bg = App.Store.getSetup().background;
    pickedScreen.push(screen);
    pickedImagePx.push(backgroundToImagePx(bg, world));
    if (pickedScreen.length === 2) {
      picking = false;
      const pxDist = Math.hypot(pickedImagePx[1].x - pickedImagePx[0].x, pickedImagePx[1].y - pickedImagePx[0].y);
      const realStr = prompt('Real-world distance between the two points you clicked (meters):', '1.0');
      const real = parseFloat(realStr);
      if (real && real > 0 && pxDist > 0) {
        const newPxPerMeter = pxDist / real;
        App.Store.setBackground(Object.assign({}, bg, { pxPerMeter: newPxPerMeter }));
        updateBgInfo();
        App.toast(`Background calibrated: ${newPxPerMeter.toFixed(2)} image px/m.`);
      }
      pickedScreen = [];
      pickedImagePx = [];
    }
  }

  App.calibration = {
    init() {
      dom.qs('#import-bg').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) importImage(file);
        e.target.value = '';
      });
      dom.qs('#btn-calibrate').addEventListener('click', start);
      dom.qs('#btn-clear-bg').addEventListener('click', () => {
        App.Store.setBackground(null);
        updateBgInfo();
        App.canvas.render();
      });
      App.Store.subscribe(updateBgInfo);
      updateBgInfo();
    },
    isActive() { return picking; },
    pick,
    hintText() {
      return pickedScreen.length === 0
        ? 'Calibration: click the FIRST reference point on the image.'
        : 'Calibration: click the SECOND reference point on the image.';
    },
    drawPickedPoints(ctx, view) {
      pickedScreen.forEach(s => {
        ctx.save();
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    }
  };
})();
