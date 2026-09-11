(function () {
  'use strict';
  const app = window.FrozenApp = window.FrozenApp || {};
  // 按用户确认的任务注册业务页面；独立模块在此脚本后、shell.js 前加载。
  // 注册键：端:路由ID。渲染函数签名：(container, route)。未注册路由保留公共占位视图。
  app.pages = app.pages || Object.create(null);
}());
