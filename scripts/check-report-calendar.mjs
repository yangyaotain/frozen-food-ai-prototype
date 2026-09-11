import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), read = p => fs.readFileSync(new URL(p, root), 'utf8');
const cache = new Map(), storage = { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) };
const context = { window: { FrozenApp: {}, localStorage: storage }, URL, URLSearchParams };
for (const m of read('admin/index.html').matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) if (m[1] !== 'shell.js') vm.runInNewContext(read('assets/js/' + m[1]), context, { filename: m[1] });
const a = context.window.FrozenApp, copy = v => JSON.parse(JSON.stringify(v));
const fresh = options => a.reportData.createStore(a.analysisStore, a.categoryStore, a.sourceStore, a.bulletinStore, { seed: false, ...options });
const store = fresh(), near = (x, y) => assert.ok(Math.abs(x - y) < .025, `${x} != ${y}`);
for (const [date, days] of [['2024-02', 29], ['2025-02', 28], ['2026-04', 30], ['2026-08', 31]]) {
  const row = store.generate({ merchant: 'demo-a', kind: 'month', date });
  assert.equal(row.start, date + '-01'); assert.equal(row.end, date + '-' + days); assert.equal(row.days, days);
  assert.equal(row.kind, 'month'); assert.equal(row.count, null);
  const s = row.snapshot, t = s.totals;
  for (const key of ['opening', 'inbound', 'outbound', 'closing']) near(t[key], s.rows.reduce((n, r) => n + r[key], 0));
  for (const key of ['inbound', 'outbound']) near(t[key], s.series.reduce((n, r) => n + r[key], 0));
  near(t.opening, s.series[0].opening); near(t.closing, s.series.at(-1).closing);
  near(t.opening + t.inbound - t.outbound, t.closing);
  near(t.turnover.days, Math.round(days * (t.opening + t.closing) / 2 / t.outbound * 100) / 100);
  assert.ok(s.series.every(r => r.start >= row.start && r.end <= row.end));
  assert.ok(s.categories.every(c => c.change.start.endsWith('-01')));
  assert.ok(s.references.every(r => r.publishedAt.slice(0, 10) >= row.start && r.publishedAt.slice(0, 10) <= row.end));
  const html = a.reportView.render(row);
  assert.ok(html.includes('月报') && html.includes(days + ' 天'));
  assert.equal(/NaN|undefined|4 周 \/ 28/.test(html), false);
}
const august = store.list().find(r => r.start === '2026-08-01');
assert.equal(august.snapshot.categories.find(c => c.id === 'poultry').market.price, null);
const weekly = store.generate({ merchant: 'demo-b', kind: 'week', date: '2026-08-24' });
assert.equal(weekly.days, 7); assert.equal(weekly.end, '2026-08-30');
const july = store.generate({ merchant: 'demo-b', kind: 'month', date: '2026-07' });
assert.equal(july.snapshot.safety.allowed, false, '上月市场汇总受限时月报不可发布');
const revised = store.regenerate(august.id, august.version, august.revision);
assert.equal(revised.kind, 'month'); assert.equal(revised.end, '2026-08-31');
assert.deepEqual(copy(store.get(august.id, 1)), copy(august));

// Frozen legacy jobs and logs survive splitting the old schedule into weekly/monthly profiles.
const now = Date.parse('2026-09-10T08:00:00+08:00');
const initial = a.generationSchedule.create({ now: () => now, delay: () => Promise.resolve() });
const legacyConfig = { ...initial.summary('report-month').config, enabled: false, count: 4 };
const legacyLog = { key: 'reports', time: '2026-09-01 09:00:00', status: 'waiting', result: '原期间待补', details: [{ start: '2026-08-03', end: '2026-08-30', message: '原期间待补' }] };
const oldState = { schema: 1, profiles: { week: initial.summary('week'), month: initial.summary('month'), reports: { config: legacyConfig, revision: 3, nextAt: 0, status: 'waiting', lastAt: legacyLog.time, result: legacyLog.result } },
  jobs: [{ key: 'reports', id: 'reports|demo-a|2026-08-24|4', slot: Date.parse('2026-09-01T09:00:00+08:00'), retryAt: now - 1, revision: 2, attempts: 1, input: { merchant: 'demo-a', end: '2026-08-24', count: 4 } }], logs: [legacyLog] };
let saved = JSON.stringify(oldState);
const migrated = a.generationSchedule.create({ now: () => now, delay: () => Promise.resolve(), stores: { 'report-month': store }, storage: { getItem: () => saved, setItem: (_, v) => { saved = v; } } });
assert.equal(JSON.parse(saved).schema, 2);
assert.deepEqual(JSON.parse(saved).logs, [legacyLog]);
assert.deepEqual(JSON.parse(saved).jobs[0].input, oldState.jobs[0].input);
assert.equal(migrated.summary('report-week').config.enabled, false);
const p = migrated.summary('report-month');
assert.equal(p.config.enabled, false); assert.equal(p.pending, 1);
assert.equal(migrated.saveMany([{ key: 'report-month', revision: p.revision, config: { ...p.config, enabled: true } }]).valid, true);
await migrated.tick();
const recovered = store.list().find(r => !r.kind && r.count === 4);
assert.equal(recovered.start, '2026-08-03'); assert.equal(recovered.end, '2026-08-30');
assert.equal(recovered.generation.configRevision, 2);
assert.deepEqual(migrated.records('reports', 'report-month').map(copy).find(r => r.time === legacyLog.time), legacyLog);

// Edited old drafts are never treated as disposable examples.
const legacy = fresh().generate({ merchant: 'demo-c', end: '2026-08-24', count: 4 });
legacy.revision = 2; legacy.summary = '人工保留内容'; legacy.history.push({ action: '编辑', time: legacy.updatedAt });
let content = JSON.stringify({ schema: 1, records: [legacy] });
const restored = fresh({ seed: true, storage: { getItem: () => content, setItem: (_, v) => { content = v; } } });
assert.deepEqual(copy(restored.get(legacy.id, 1)), copy(legacy));
const again = fresh({ seed: true, storage: { getItem: () => content, setItem: (_, v) => { content = v; } } });
assert.equal(again.list().length, restored.list().length);
console.log('PASS: full calendar months, leap years, day allocation/turnover, prior-month safety, immutable versions, split-schedule migration and preserved legacy edits/jobs. Node/static only.');
