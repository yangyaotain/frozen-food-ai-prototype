(function () {
  'use strict';
  const app = window.FrozenApp;
  app.pages['merchant:reports'] = function (container, route) { app.merchantPage.mount(container, route); };
  app.pages['merchant:advice'] = function (container, route) { app.merchantPage.mount(container, route); };
}());
