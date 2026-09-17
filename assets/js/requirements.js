(function () {
  'use strict';
  const app = window.FrozenApp;
  document.querySelectorAll('[data-icon]').forEach(function (node) {
    node.innerHTML = app.icon(node.dataset.icon);
  });
  const closeButton = document.querySelector('[data-close-page]');
  closeButton.addEventListener('click', function () {
    window.close();
    if (!window.closed) window.location.href = './index.html';
  });
}());
