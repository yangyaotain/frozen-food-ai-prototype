(function () {
  'use strict';
  const app = window.FrozenApp, dayMs = 86400000, offset = 8 * 3600000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const stamp = ms => new Date(ms + offset).toISOString().slice(0, 19).replace('T', ' ');
  const date = ms => stamp(ms).slice(0, 10);
  const add = (value, days) => new Date(Date.parse(value + 'T00:00:00Z') + days * dayMs).toISOString().slice(0, 10);
  const keys = ['week', 'month', 'report-week', 'report-month'];
  const isReport = key => key.startsWith('report');
  const kind = key => key.endsWith('month') ? 'month' : 'week';
  const names = { week: '行情周报', month: '行情月报', 'report-week': '商户经营周报', 'report-month': '商户经营月报', reports: '历史商户经营报告' };
  const labels = { idle: '等待执行', running: '生成中', success: '成功', partial: '部分成功', waiting: '等待数据', failed: '失败' };
  function nextTime(config, after) {
    const local = new Date(after + offset), parts = config.time.split(':').map(Number);
    if (config.frequency === 'week') {
      let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), parts[0], parts[1]) - offset;
      target += ((config.weekday - local.getUTCDay() + 7) % 7) * dayMs;
      return target > after ? target : target + 7 * dayMs;
    }
    for (let i = 0; i < 2; i++) {
      const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + i + 1, 0)).getUTCDate();
      const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + i, Math.min(config.day, last), parts[0], parts[1]) - offset;
      if (target > after) return target;
    }
  }
  // The business period is anchored to the scheduled slot, never the retry date.
  function inputs(key, config, slot) {
    const local = new Date(slot + offset), today = date(slot);
    const monday = add(today, -((local.getUTCDay() + 6) % 7) - 7);
    const month = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    if (isReport(key)) return app.reportData.merchants.map(m => ({ merchant: m.id, kind: kind(key), date: kind(key) === 'week' ? monday : month }));
    return [{ kind: key, date: key === 'week' ? monday : month, categories: config.categories.slice() }];
  }
  function identity(key, input) {
    return isReport(key) ? [key, input.merchant, input.kind || 'legacy', input.date || input.end, input.kind ? '' : input.count].join('|') : [key, input.date, input.categories.slice().sort().join(',')].join('|');
  }
  function period(key, input) {
    return isReport(key) ? app.reportData.period(input) : app.bulletinData.period(input);
  }
  function create(options) {
    options = options || {};
    const now = options.now || Date.now;
    const delay = options.delay || (() => new Promise(resolve => window.setTimeout(resolve, 350)));
    const storage = options.storage, storageKey = 'frozen-generation-schedule-v1';
    const stores = { week: app.bulletinStore, month: app.bulletinStore, 'report-week': app.reportStore, 'report-month': app.reportStore, ...options.stores };
    const active = options.active || (() => !app.access || app.access.can('maintain'));
    let timer = null, busy = false, epoch = 0, storageAvailable = !!storage;
    const listeners = new Set();
    let state = { schema: 2, profiles: {}, jobs: [], logs: [] };
    function validate(key, c) {
      return keys.includes(key) && c && typeof c.enabled === 'boolean' && ['week', 'month'].includes(c.frequency) &&
        c.frequency === kind(key) && Number.isInteger(c.weekday) && c.weekday >= 0 && c.weekday <= 6 &&
        Number.isInteger(c.day) && c.day >= 1 && c.day <= 31 && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.time) &&
        (isReport(key) ? true : Array.isArray(c.categories) && c.categories.length > 0 &&
          new Set(c.categories).size === c.categories.length && c.categories.every(id => app.categoryCatalog.find(id)));
    }
    keys.forEach(key => {
      const config = { enabled: true, frequency: kind(key), weekday: 1, day: 1, time: '09:00', categories: app.categoryCatalog.ids() };
      state.profiles[key] = { revision: 1, config, nextAt: nextTime(config, now()), lastAt: null, status: 'idle', result: '尚未执行' };
    });
    if (storage) {
      try {
        const saved = JSON.parse(storage.getItem(storageKey));
        if (saved && saved.schema === 1 && saved.profiles?.reports && Array.isArray(saved.jobs) && Array.isArray(saved.logs)) {
          const old = saved.profiles.reports, target = 'report-' + old.config.frequency;
          saved.legacyReports = clone(old);
          saved.profiles['report-week'] = clone(state.profiles['report-week']);
          saved.profiles['report-month'] = clone(state.profiles['report-month']);
          if (!old.config.enabled) for (const key of ['report-week', 'report-month']) { saved.profiles[key].config.enabled = false; saved.profiles[key].nextAt = 0; }
          if (keys.includes(target)) saved.profiles[target] = { ...clone(state.profiles[target]), revision: old.revision, config: { ...clone(old.config), frequency: kind(target) }, nextAt: old.config.enabled ? nextTime(old.config, now()) : 0 };
          delete saved.profiles.reports;
          saved.jobs.forEach(job => { if (job.key === 'reports') { job.key = target; job.id = identity(target, job.input); } });
          saved.schema = 2;
        }
        if (saved && saved.schema === 2 && keys.every(key => saved.profiles && validate(key, saved.profiles[key]?.config) &&
          Number.isInteger(saved.profiles[key].revision) && Number.isFinite(saved.profiles[key].nextAt)) &&
          Array.isArray(saved.jobs) && saved.jobs.every(j => keys.includes(j.key) && Number.isFinite(j.slot) && Number.isFinite(j.retryAt) && j.input && j.id === identity(j.key, j.input)) && Array.isArray(saved.logs)) {
          state = saved;
          keys.forEach(key => { if (state.profiles[key].status === 'running') state.profiles[key].status = 'idle'; });
        }
      } catch (_) { storageAvailable = false; }
    }
    function persist() {
      if (!storage) return;
      try { storage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; } catch (_) { storageAvailable = false; }
    }
    function emit() { listeners.forEach(fn => fn()); }
    function existing(job) {
      const range = period(job.key, job.input);
      return stores[job.key].list().find(r => isReport(job.key) ? r.merchant.id === job.input.merchant && r.start === range.start && r.end === range.end && (job.input.kind ? r.kind === job.input.kind || job.input.kind === 'week' && !r.kind && r.count === 1 : r.count === job.input.count && !r.kind) :
        r.kind === job.input.kind && r.start === range.start && r.end === range.end && r.snapshot.categories.map(c => c.id).sort().join(',') === job.input.categories.slice().sort().join(','));
    }
    function saveMany(changes) {
      if (!active()) return { valid: false, message: '当前会话已退出，请重新登录。' };
      if (!changes.length || new Set(changes.map(c => c.key)).size !== changes.length || changes.some(c => !validate(c.key, c.config))) return { valid: false, message: '请填写有效的周期、时间及生成范围。' };
      if (changes.some(c => state.profiles[c.key].revision !== c.revision || state.profiles[c.key].status === 'running')) return { valid: false, message: '配置或执行状态已变化，请关闭后重新打开设置。' };
      let changed = false;
      changes.forEach(change => {
        const p = state.profiles[change.key], c = clone(change.config);
        c.categories.sort();
        if (JSON.stringify({ ...p.config, categories: p.config.categories.slice().sort() }) === JSON.stringify(c)) return;
        p.config = c; p.revision++; changed = true;
        p.nextAt = c.enabled ? nextTime(c, now()) : 0;
      });
      persist(); emit(); return { valid: true, unchanged: !changed, storageAvailable };
    }
    function enqueue(key, slot) {
      const p = state.profiles[key];
      inputs(key, p.config, slot).forEach(input => {
        const id = identity(key, input);
        if (!state.jobs.some(job => job.id === id)) state.jobs.push({ id, key, input, slot, revision: p.revision, retryAt: slot, attempts: 0, status: 'idle', message: '' });
      });
    }
    async function tick() {
      if (busy || !active()) return;
      busy = true; const token = epoch;
      try {
        // Bound each pass; persisted nextAt retains remaining missed slots for subsequent passes.
        keys.forEach(key => {
          const p = state.profiles[key];
          if (!p.config.enabled) return;
          for (let n = 0; p.nextAt && p.nextAt <= now() && n < 12; n++) {
            const slot = p.nextAt; enqueue(key, slot); p.nextAt = nextTime(p.config, slot);
          }
        });
        persist();
        for (const key of keys) {
          const p = state.profiles[key];
          if (!p.config.enabled) continue;
          const jobs = state.jobs.filter(j => j.key === key && j.retryAt <= now());
          if (!jobs.length) continue;
          p.status = 'running'; emit();
          await delay();
          if (!active() || epoch !== token) { p.status = 'idle'; persist(); emit(); return; }
          const details = [], completed = new Set();
          let succeeded = 0, skipped = 0, waiting = 0, failed = 0;
          for (const job of jobs) {
            job.attempts++;
            let row;
            try {
              row = existing(job);
              if (row) { skipped++; job.status = 'success'; job.message = '相同期间已有内容，保留原版本'; }
              else {
                row = stores[key].generateScheduled(job.input, { scheduledAt: stamp(job.slot), configRevision: job.revision });
                succeeded++; job.status = 'success'; job.message = '已生成 V' + row.version + '，待复核';
              }
              completed.add(job.id);
            } catch (error) {
              job.message = String(error.message);
              job.status = /数据|采价|数量|复核|期间|价格|缺少|缺失|不足/.test(job.message) ? 'waiting' : 'failed';
              if (job.status === 'waiting') waiting++; else failed++;
              job.retryAt = now() + 5 * 60000;
            }
            const range = period(key, job.input), merchant = app.reportData.merchants.find(m => m.id === job.input.merchant);
            details.push({ target: merchant ? merchant.name : job.input.categories.map(id => app.categoryCatalog.find(id).name).join('、'),
              start: range.start, end: range.end, scheduledAt: stamp(job.slot), configRevision: job.revision, attempt: job.attempts,
              status: job.status, message: job.message, recordId: row ? row.id : null, version: row ? row.version : null });
          }
          state.jobs = state.jobs.filter(j => !completed.has(j.id));
          const remaining = state.jobs.filter(j => j.key === key);
          p.lastAt = stamp(now());
          p.status = remaining.length ? (succeeded + skipped ? 'partial' : remaining.some(j => j.status === 'failed') ? 'failed' : 'waiting') : 'success';
          p.result = '生成 ' + succeeded + ' 份，已有跳过 ' + skipped + ' 份，等待数据 ' + waiting + ' 份，失败 ' + failed + ' 份';
          state.logs.unshift({ key, time: p.lastAt, status: p.status, result: p.result, details });
          state.logs = state.logs.slice(0, 60);
          persist(); emit();
        }
      } finally { busy = false; }
    }
    function summary(key) {
      const p = state.profiles[key], pending = state.jobs.filter(j => j.key === key);
      const nextRetry = p.config.enabled && pending.length ? Math.min(...pending.map(j => j.retryAt)) : null;
      return clone({ ...p, key, name: names[key], label: p.config.enabled ? labels[p.status] : '已停用', pending: pending.length,
        next: p.config.enabled ? stamp(p.nextAt) : '已停用', retry: nextRetry ? stamp(nextRetry) : null });
    }
    function stop() { epoch++; if (timer !== null) window.clearInterval(timer); timer = null; }
    function start() {
      if (timer !== null || !window.setInterval || !active()) return;
      tick();
      timer = window.setInterval(() => { if (active()) tick(); else stop(); }, 30000);
    }
    function records(group, selected) {
      // Read-only merge keeps saved schedules, jobs and actual logs intact, including old/empty caches.
      const history = options.seedHistory && app.generationHistory ? app.generationHistory.records() : [];
      const actualTimes = new Set(state.logs.map(log => log.key + '|' + log.time));
      const merged = state.logs.concat(history.filter(log => !actualTimes.has(log.key + '|' + log.time)));
      return clone(merged.filter(log => (group === 'reports' ? isReport(log.key) : !isReport(log.key)) &&
        (!selected || log.key === selected || log.key === 'reports' && selected === 'report-' + (state.legacyReports?.config.frequency || 'week'))).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 20));
    }
    persist();
    return { summary, saveMany, tick, start, stop, records,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, storageAvailable: () => storageAvailable };
  }
  app.generationSchedule = { create, nextTime, inputs, period, stamp, names, labels };
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = null; }
  app.generationStore = create({ storage, seedHistory: true });
}());
