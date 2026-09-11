(function () {
  'use strict';
  const app = window.FrozenApp;
  app.pages['merchant:market'] = function (container, route) { app.merchantPage.mount(container, route); };
}());
