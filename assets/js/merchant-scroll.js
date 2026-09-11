(function () {
  'use strict';
  // One scroll surface for the whole mini-program. Touch and mouse share direction/threshold rules.
  window.FrozenApp.merchantScroll = function (area, options) {
    let start = null, distance = 0, dragging = false, suppress = false, disposed = false;
    let suppressTimer = null;
    function reset() { start = null; distance = 0; dragging = false; options.pull(0, false); }
    function begin(x, y, target) {
      if (!options.enabled() || options.busy() || area.scrollTop > 0 || target.closest('input, button, select, textarea, summary, dialog, .mini-chips')) return;
      start = { x: x, y: y }; distance = 0; dragging = false;
    }
    function move(x, y, e) {
      if (!start) return;
      if (!options.enabled() || options.busy()) { reset(); return; }
      const dx = x - start.x, dy = y - start.y;
      if (!dragging && Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (!dragging && (dy <= 0 || Math.abs(dx) >= dy)) { reset(); return; }
      dragging = true; distance = Math.min(88, Math.max(0, dy * 0.5));
      if (e.cancelable) e.preventDefault();
      options.pull(distance, distance >= 60);
    }
    function end(cancelled) {
      const refresh = dragging && distance >= 60 && !cancelled && options.enabled() && !options.busy();
      if (dragging) { suppress = true; if (suppressTimer !== null) window.clearTimeout(suppressTimer); suppressTimer = window.setTimeout(function () { suppress = false; suppressTimer = null; }, 400); }
      reset(); if (refresh) options.refresh();
    }
    function touchStart(e) { if (e.touches.length !== 1) { end(true); return; } begin(e.touches[0].clientX, e.touches[0].clientY, e.target); }
    function touchMove(e) { if (e.touches.length !== 1) { end(true); return; } move(e.touches[0].clientX, e.touches[0].clientY, e); }
    function touchEnd() { end(false); }
    function cancel() { end(true); }
    function mouseStart(e) { if (e.button === 0) begin(e.clientX, e.clientY, e.target); }
    function mouseMove(e) { if (e.buttons !== 1) { if (start) end(true); return; } move(e.clientX, e.clientY, e); }
    function mouseEnd() { end(false); }
    function preventClick(e) { if (suppress) { e.preventDefault(); e.stopImmediatePropagation(); suppress = false; } }
    function preventDrag(e) { if (start) e.preventDefault(); }
    function check() { if (!disposed && options.enabled() && !options.busy() && area.scrollHeight - area.scrollTop - area.clientHeight < 120) options.more(); }
    area.addEventListener('touchstart', touchStart, { passive: true });
    area.addEventListener('touchmove', touchMove, { passive: false });
    area.addEventListener('touchend', touchEnd); area.addEventListener('touchcancel', cancel);
    area.addEventListener('mousedown', mouseStart); window.addEventListener('mousemove', mouseMove); window.addEventListener('mouseup', mouseEnd);
    window.addEventListener('blur', cancel); area.addEventListener('click', preventClick, true); area.addEventListener('dragstart', preventDrag);
    area.addEventListener('scroll', check, { passive: true }); window.addEventListener('resize', check);
    return { check: check, cancel: cancel, destroy: function () {
      disposed = true; reset(); if (suppressTimer !== null) window.clearTimeout(suppressTimer);
      area.removeEventListener('touchstart', touchStart); area.removeEventListener('touchmove', touchMove);
      area.removeEventListener('touchend', touchEnd); area.removeEventListener('touchcancel', cancel);
      area.removeEventListener('mousedown', mouseStart); window.removeEventListener('mousemove', mouseMove); window.removeEventListener('mouseup', mouseEnd);
      window.removeEventListener('blur', cancel); area.removeEventListener('click', preventClick, true); area.removeEventListener('dragstart', preventDrag);
      area.removeEventListener('scroll', check); window.removeEventListener('resize', check);
    } };
  };
}());
