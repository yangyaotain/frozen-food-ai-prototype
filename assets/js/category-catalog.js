(function () {
  'use strict';
  const app = window.FrozenApp;
  // Public editorial classifications shared by administration and merchant views.
  app.newsTypes = Object.freeze({ policy: '政策信息', industry: '行业资讯', market: '供需行情' });
  // Shared public directory. Existing IDs remain stable for published snapshots.
  const groups = ['禽类', '猪类', '牛羊类', '水产类', '调理食品类'];
  const categories = [
    ['poultry', '鸡副', '禽类'], ['seafood', '水产', '水产类'], ['pork', '猪副', '猪类'],
    ['chicken', '鸡肉', '禽类'], ['duck', '鸭肉', '禽类'], ['duck-offal', '鸭副', '禽类'],
    ['pork-meat', '猪肉', '猪类'], ['beef', '牛肉', '牛羊类'], ['beef-offal', '牛副', '牛羊类'],
    ['lamb', '羊肉', '牛羊类'], ['lamb-offal', '羊副', '牛羊类'], ['prepared', '速冻调理品', '调理食品类']
  ].map(function (c) { return Object.freeze({ id: c[0], name: c[1], group: c[2] }); });
  function grouped() { return groups.flatMap(function (group) { return categories.filter(function (c) { return c.group === group; }); }); }
  app.categoryCatalog = Object.freeze({ categories: Object.freeze(categories), groups: Object.freeze(groups), grouped: grouped,
    find: function (id) { return categories.find(function (c) { return c.id === id; }); },
    ids: function () { return categories.map(function (c) { return c.id; }); } });
}());
