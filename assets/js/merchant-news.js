(function () {
  'use strict';
  const app = window.FrozenApp;
  app.pages['merchant:news'] = function (container, route) { app.merchantPage.mount(container, route); };
}());
