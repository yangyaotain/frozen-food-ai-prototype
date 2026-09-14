(function () {
  'use strict';
  const app = window.FrozenApp;
  const schedules = { twice: '每日两次 · 09:00、16:00', frequent: '每2小时 · 08:00—20:00', daily: '每日一次 · 09:00' };
  const rules = { column: '通用资讯栏目', api: '标准资讯接口' };
  const clone = value => JSON.parse(JSON.stringify(value));
  function stamp(ms) { return new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
  function nextTime(schedule, ms) {
    const date = stamp(ms).slice(0, 10), midnight = Date.parse(date + 'T00:00:00+08:00');
    const hours = schedule === 'frequent' ? [8, 10, 12, 14, 16, 18, 20] : schedule === 'twice' ? [9, 16] : [9];
    for (let day = 0; day < 2; day++) for (const hour of hours) {
      const candidate = midnight + day * 86400000 + hour * 3600000;
      if (candidate > ms) return candidate;
    }
  }
  function snapshot(value) { const result = Object.assign({}, value); delete result.history; return clone(result); }
  function canonical(url) { const parsed = new URL(url); parsed.hash = ''; return parsed.href; }
  // Local article feed only: no request is made to any source website or API.
  function localFeed(source, request) {
    const day = stamp(request.now).slice(0, 10);
    const topics = {
      policy: ['冷链交接资料归档要点', '商品交接资料应对应批次、产地、净重和交接时间，调整记录需保留依据。本文整理资料核对事项，具体适用要求应结合原始文件核验。'],
      industry: ['冻品分批交付与库存周转观察', '分批交付会影响每日到货节奏。判断周转变化时应结合整周入出库、期末库存与品类结构，不能将单日集中提货直接理解为需求增长。'],
      market: ['冻品到货节奏与供需观察', '到货批次与实际到货重量需分别记录，供需观察应比较相同期间和相同品类的数量。跨周交付与库存调整应单独说明，避免将截止日差异当作行情变化。']
    };
    const topic = topics[source.type];
    return [{ articleId: 'daily-' + day, url: new URL('articles/' + day + '.html', source.url).href,
      title: topic[0] + '（' + day + '）', content: topic[1] + '\n\n关注范围\n' + source.scope + '。\n\n阅读说明\n结合原始单据、统计期间和重量单位核对，本文不作价格涨跌预测。',
      publishedAt: day + ' 08:00:00', categories: source.categories.slice(), validThrough: stamp(request.now + 30 * 86400000).slice(0, 10) }];
  }
  function create(store, options) {
    options = options || {};
    const now = options.now || Date.now, read = options.read || localFeed;
    const delay = options.delay || (ms => new Promise(resolve => window.setTimeout(resolve, ms)));
    const listeners = new Set();
    let serial = 0, timer = null;
    const active = () => !app.access || app.access.can('read');
    function config(source) {
      if (!source.collection) source.collection = { revision: 1, rule: '', enabled: false, schedule: 'twice', boundUrl: source.url,
        lastAt: '', lastSuccessAt: '', cursor: 0, nextAt: 0, retryAt: 0, attempt: 0, status: 'idle', lastResult: '', running: false };
      return source.collection;
    }
    function ready(source) { const c = config(source); return source.status === 'confirmed' && !!rules[c.rule] && c.boundUrl === source.url; }
    function refresh(source) {
      const c = config(source);
      if (!ready(source) || !c.enabled) { c.nextAt = 0; c.retryAt = 0; }
      else if (!c.nextAt && !c.retryAt && !c.running && c.status !== 'error') c.nextAt = nextTime(c.schedule, now());
    }
    function emit() { listeners.forEach(listener => listener()); }
    function log(source, action, opinion, before, batch, actor) {
      source.history.push({ action, actor: actor || (app.actor ? app.actor('数据管理员') : '数据管理员'), at: stamp(now()), opinion, before, after: snapshot(source), collectionBatch: batch ? clone(batch) : null });
    }
    store.sources.forEach(source => {
      const c = config(source);
      c.rule = 'column'; c.enabled = source.status === 'confirmed';
      c.schedule = /周刊|周报/.test(source.name) ? 'daily' : source.type === 'market' ? 'frequent' : 'twice';
      refresh(source);
    });
    const saveSource = store.save, confirmSource = store.confirm;
    store.save = function (input, id, version) {
      const old = id && store.find(id), oldUrl = old && old.url;
      const result = saveSource(input, id, version);
      if (result.valid && !result.unchanged) {
        const c = config(result.source); c.revision++; c.attempt = 0; c.retryAt = 0;
        if (oldUrl && oldUrl !== result.source.url) { c.rule = ''; c.enabled = false; c.boundUrl = result.source.url; c.cursor = 0; c.lastSuccessAt = ''; }
        refresh(result.source); emit();
      }
      return result;
    };
    store.confirm = function () { const result = confirmSource.apply(store, arguments); if (result.valid) { refresh(result.source); emit(); } return result; };
    function save(id, revision, input) {
      if (!active()) return { valid: false, message: '当前会话已退出，请重新登录。' };
      const source = store.find(id);
      if (!source) return { valid: false, message: '来源不存在。' };
      const c = config(source);
      if (c.revision !== revision || c.running) return { valid: false, message: '获取配置或执行状态已变化，请关闭后重新打开。' };
      if ((input.rule && !rules[input.rule]) || !schedules[input.schedule] || typeof input.enabled !== 'boolean') return { valid: false, message: '请选择有效的获取规则和周期。' };
      if (input.enabled && (!input.rule || source.status !== 'confirmed')) return { valid: false, message: '请先确认来源并配置获取规则，再启用自动获取。' };
      if (input.rule === c.rule && input.schedule === c.schedule && input.enabled === c.enabled) return { valid: true, unchanged: true };
      const before = snapshot(source);
      Object.assign(c, { rule: input.rule, schedule: input.schedule, enabled: input.enabled, boundUrl: source.url, revision: c.revision + 1, nextAt: 0, retryAt: 0, attempt: 0, status: 'idle' });
      refresh(source);
      log(source, '调整资讯获取配置', (c.enabled ? '已启用自动获取；' : '自动获取已关闭；') + schedules[c.schedule] + '；获取规则：' + (rules[c.rule] || '未配置') + '。', before);
      emit(); return { valid: true };
    }
    function summary(source) {
      const c = config(source); refresh(source);
      return { config: c, available: ready(source), label: c.running ? '获取中' : !ready(source) ? (source.status !== 'confirmed' ? '待确认来源' : '待配置规则') : c.status === 'error' ? '获取异常' : c.retryAt ? '等待重试' : c.enabled ? '自动获取已启用' : '手动获取',
        next: c.running ? '本次执行中' : c.retryAt ? stamp(c.retryAt) + '（重试）' : c.nextAt ? stamp(c.nextAt) : c.status === 'error' ? '等待人工重试' : '未安排自动获取' };
    }
    function ingest(source, rows, batch, requestedAt) {
      if (!Array.isArray(rows)) throw new Error('返回内容格式不正确');
      const cutoff = batch.from, to = requestedAt;
      rows.forEach(raw => {
        try {
          const published = Date.parse(String(raw.publishedAt).replace(' ', 'T') + '+08:00');
          const url = canonical(raw.url), cat = raw.categories || [];
          if (!/^https?:/.test(url) || !raw.title || raw.title.length > 100 || !raw.content || raw.content.length > 3000 || !Number.isFinite(published) || !cat.length || cat.some(id => !source.categories.includes(id))) throw new Error('标题、正文、时间或品类不完整');
          const articleId = String(raw.articleId || '');
          const item = store.items.find(item => item.sourceId === source.id && ((articleId && item.externalId === articleId) || (item.infoUrl && canonical(item.infoUrl) === url)));
          if (published > to || (!item && published < cutoff)) { batch.skipped++; return; }
          if (item && item.title === raw.title && item.content === raw.content && item.publishedAt === raw.publishedAt && item.categories.slice().sort().join(',') === cat.slice().sort().join(',')) { batch.duplicate++; return; }
          const prior = item ? snapshot(item) : null;
          const target = item || { id: 'collected-' + source.id + '-' + (++serial), sourceId: source.id, version: 0, releaseVersion: 0, history: [] };
          Object.assign(target, { externalId: articleId, infoUrl: url, title: raw.title, content: raw.content, publishedAt: raw.publishedAt,
            sourceSnapshot: snapshot(source), categories: cat.slice(), type: item ? item.type : source.type,
            displayTitle: raw.title, displaySummary: '', displayHighlights: [], displayContent: raw.content, displayAttention: '', validThrough: raw.validThrough || '',
            obtainedAt: stamp(requestedAt), collectionBatchId: batch.id, abnormal: item ? '来源原文已更新，需重新核验' : '',
            issueType: '', treatment: 'corrected', resolution: '', signal: null, context: '', platformFacts: null,
            status: 'pending', verifiedSourceVersion: null, publication: null, version: target.version + 1 });
          target.history.push({ action: item ? '获取原文更新，重新核验' : '获取新增资讯', actor: '系统获取', at: stamp(requestedAt), opinion: '获取批次 ' + batch.id + '；原文留档，逐篇核验通过后人工发布。', before: prior, after: snapshot(target) });
          if (!item) store.items.unshift(target);
          batch[item ? 'updated' : 'added']++;
        } catch (error) { batch.failed++; batch.errors.push((raw && (raw.title || raw.url) ? String(raw.title || raw.url).slice(0, 120) + '：' : '未识别条目：') + String(error.message)); }
      });
    }
    async function run(id, trigger) {
      if (!active()) return { valid: false, message: '当前会话已退出，请重新登录。' };
      const source = store.find(id);
      if (!source || !ready(source)) return { valid: false, message: '请先确认来源并完成获取规则配置。' };
      const c = config(source);
      if (c.running) return { valid: false, message: '该来源正在获取，请勿重复执行。' };
      const manual = trigger !== 'automatic' && trigger !== 'retry';
      if (!manual && !c.enabled) return { valid: false, message: '自动获取已关闭。' };
      if (manual) c.attempt = 0;
      const started = now(), version = source.version, revision = c.revision, before = snapshot(source);
      const batch = { id: 'GET-' + source.id + '-' + started + '-' + (++serial), trigger: manual ? '手动获取' : trigger === 'retry' ? '失败重试' : '定期获取',
        sourceVersion: version, sourceUrl: source.url, configRevision: revision, rule: c.rule,
        from: c.cursor ? c.cursor - 86400000 : started - 30 * 86400000, to: started, added: 0, updated: 0, duplicate: 0, skipped: 0, failed: 0, errors: [], attempt: c.attempt + 1 };
      c.running = true; c.status = 'running'; c.retryAt = 0; c.nextAt = 0; emit();
      try {
        await delay(650);
        if (!active()) { c.running = false; c.status = 'idle'; return { valid: false, message: '会话已退出，本次获取已取消。' }; }
        const rows = await read(clone(source), { now: started, from: batch.from, to: started, incremental: !!c.cursor });
        if (!active()) { c.running = false; c.status = 'idle'; return { valid: false, message: '会话已退出，本次获取已取消。' }; }
        if (source.version !== version || c.revision !== revision || !ready(source)) throw new Error('执行期间来源或获取配置发生变化，本批次未写入');
        ingest(source, rows, batch, started);
        if (batch.failed) throw new Error('部分资讯字段不完整，请查看失败记录');
        c.cursor = started; c.lastSuccessAt = stamp(started); c.status = 'success'; c.attempt = 0;
      } catch (error) {
        if (!batch.failed) batch.failed = 1;
        batch.errors.push(String(error.message)); c.attempt++; c.status = c.attempt <= 2 && c.enabled && ready(source) ? 'retry' : 'error';
        if (c.status === 'retry') c.retryAt = now() + (c.attempt === 1 ? 5 : 15) * 60000;
      }
      c.running = false; c.lastAt = stamp(now());
      c.lastResult = (c.status === 'success' ? '获取成功' : c.status === 'retry' ? '获取失败，等待重试' : '获取异常') + ' · 新增 ' + batch.added + '，更新 ' + batch.updated + '，重复 ' + batch.duplicate + '，失败 ' + batch.failed;
      refresh(source);
      log(source, c.status === 'success' ? '完成资讯获取' : '资讯获取失败', c.lastResult + (batch.errors.length ? '；' + batch.errors.join('；') : ''), before, batch, manual ? null : '系统获取');
      if (app.newsData) app.newsData.write(store.newsPublished());
      emit(); return { valid: true, success: c.status === 'success', batch: clone(batch), message: c.lastResult };
    }
    function tick() {
      if (!active()) return;
      store.sources.forEach(source => {
        const c = config(source); refresh(source);
        if (!ready(source) || !c.enabled || c.running || c.status === 'error') return;
        if (c.retryAt && c.retryAt <= now()) run(source.id, 'retry');
        else if (!c.retryAt && c.nextAt && c.nextAt <= now()) run(source.id, 'automatic');
      });
    }
    function start() { if (timer !== null || !window.setInterval) return; timer = window.setInterval(function () { if (active()) tick(); else stop(); }, 30000); }
    function stop() { if (timer !== null) window.clearInterval(timer); timer = null; }
    return { config, summary, save, run, tick, start, stop, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, records(id) { return store.find(id).history.filter(h => h.collectionBatch).slice().reverse(); } };
  }
  app.sourceCollection = { create, schedules, rules, nextTime, stamp };
  app.collectionStore = create(app.sourceStore);
}());
