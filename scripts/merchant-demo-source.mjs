import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const moduleNames = [
  'common',
  'category-catalog',
  'scenario-data',
  'price-store',
  'category-store',
  'news-data',
  'source-store',
  'source-collection',
  'analysis-insights',
  'analysis-store',
  'publication-policy',
  'evidence-view',
  'period-insights',
  'market-data',
  'bulletin-store',
  'report-store',
  'report-client',
  'admin-example-states'
];

class SnapshotDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ['2026-09-11T01:00:00Z']));
  }

  static now() {
    return new Date('2026-09-11T01:00:00Z').getTime();
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isolateId(record) {
  const value = clone(record);
  value.id = 'mini-demo-' + value.id;
  return value;
}

export function createMerchantDemoProjection() {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const context = {
    window: { FrozenApp: {}, localStorage: storage },
    URL,
    URLSearchParams,
    Date: SnapshotDate
  };

  for (const name of moduleNames) {
    vm.runInNewContext(fs.readFileSync(new URL('assets/js/' + name + '.js', root), 'utf8'), context, { filename: name });
  }

  const app = context.window.FrozenApp;
  if (app.exampleStateCoverage.errors.length) {
    throw new Error('管理端默认状态初始化失败：' + app.exampleStateCoverage.errors.join('；'));
  }

  const market = app.bulletinStore.published().map(app.marketData.project).filter(Boolean).map(isolateId);
  const news = app.sourceStore.newsPublished().map(app.newsData.project).map(isolateId);
  const reports = Object.fromEntries(['demo-a', 'demo-b', 'demo-c'].map(function (merchantId) {
    const rows = app.reportStore.publishedFor(merchantId).map(app.reportClient.project).map(function (record) {
      const value = isolateId(record);
      value.snapshot.bulletins = value.snapshot.bulletins.map(isolateId);
      return value;
    });
    return [merchantId, rows];
  }));

  return { app, public: { market, news }, reports };
}

export function normalizedSnapshot(value) {
  const result = clone(value);
  const visit = item => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.id === 'string') item.id = item.id.replace(/^mini-demo-/, '');
    Object.values(item).forEach(visit);
  };
  visit(result);
  return result;
}
