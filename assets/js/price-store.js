(function () {
  'use strict';
  const app = window.FrozenApp;
  const actorName = function (fallback) { return app.actor ? app.actor(fallback) : fallback; };
  const categories = app.categoryCatalog.categories;
  // Synthetic price models by stable category ID, separate from the public directory.
  const models = {
    poultry: [12000, 0.07, 0, 0.0006], seafood: [23500, 0.09, 0.4, 0.0005], pork: [17400, 0.06, 0.8, 0.0004],
    chicken: [15600, 0.05, 1.1, 0.0003], duck: [13800, 0.08, 1.5, 0.0002], 'duck-offal': [21600, 0.1, 1.9, 0.0005],
    'pork-meat': [22800, 0.07, 2.3, 0.0003], beef: [48600, 0.04, 2.8, -0.00015], 'beef-offal': [28400, 0.08, 3.2, 0.0004],
    lamb: [43200, 0.1, 3.7, 0.0002], 'lamb-offal': [25600, 0.09, 4.1, 0.0003], prepared: [18400, 0.04, 4.5, 0.0006]
  };
  // 最近八周采用分品类人工校准值，避免所有新增品类呈现同一条平滑曲线。
  const recentPrices = {
    chicken: [16420, 16610, 16380, 16540, 16820, 16670, 16490, 16620],
    duck: [14080, 14260, 14110, 14340, 13920, 14280, 14450, 14320],
    'duck-offal': [23600, 23950, 24200, 23850, 24150, 24780, 24320, 24900],
    'pork-meat': [24350, 24700, 24550, 24900, 24850, 24520, 25100, 25350],
    beef: [49400, 49150, 49700, 49200, 48850, 48600, 48950, 48700],
    'beef-offal': [29200, 29750, 29500, 29900, 30150, 30400, 29850, 30600],
    lamb: [42500, 42900, 43350, 42800, 43500, 43100, 44200, 43800],
    'lamb-offal': [24600, 25050, 24750, 24900, 25200, 24850, 25600, 25450],
    prepared: [17900, 18350, 18050, 18100, 18600, 18450, 19000, 18750]
  };
  function samplePrice(id, week) {
    const m = models[id], index = (new Date(week) - new Date('2024-01-01')) / 604800000;
    const recentIndex = samples.findIndex(function (sample) { return sample[0] === week; });
    if (recentPrices[id] && recentIndex >= 0) return recentPrices[id][recentIndex];
    return Math.round(m[0] * (1 + m[1] * Math.cos(Number(week.slice(5, 7)) / 12 * Math.PI * 2 + m[2]) + index * m[3] + 0.012 * Math.sin(index / 3 + m[2])) / 10) * 10;
  }
  const statuses = {
    pending: { name: '待复核', style: 'warning' },
    reviewed: { name: '已复核', style: 'success' },
    revision: { name: '需修改', style: 'danger' }
  };
  const headers = ['采价周起始日期', '分析品类', '周均价格', '单位', '备注'];
  const samples = [
    ['2026-08-31', [12800, 24600, 18200]], ['2026-08-24', [12600, 24200, 18300]],
    ['2026-08-17', [12500, 23900, 18000]], ['2026-08-10', [12700, 24100, 17800]],
    ['2026-08-03', [12400, 23800, 17900]], ['2026-07-27', [12300, 23500, 17600]],
    ['2026-07-20', [12100, 23700, 17500]], ['2026-07-13', [12200, 23400, 17300]]
  ];
  function dateAfter(start, days) {
    const date = new Date(start + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function weekOf(start) {
    const thursday = new Date(dateAfter(start, 3) + 'T00:00:00Z');
    const year = thursday.getUTCFullYear();
    const number = Math.ceil(((thursday - new Date(year + '-01-01T00:00:00Z')) / 86400000 + 1) / 7);
    return { id: start, end: dateAfter(start, 6), label: year + ' 年第 ' + number + ' 周' };
  }
  function stamp() { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function snapshot(record) {
    const value = copy(record);
    delete value.history;
    return value;
  }
  function createStore() {
    let serial = 24;
    const batches = [];
    const records = samples.flatMap(function (sample, index) {
      return categories.map(function (category, ci) {
        const record = {
          id: ci < 3 ? 'price-' + (index * 3 + ci + 1) : 'price-seed-' + sample[0] + '-' + category.id, week: weekOf(sample[0]), category: category,
          price: app.scenarioData && sample[0] === '2026-08-17' && ci === 2 ? 16700 : (ci < 3 ? sample[1][ci] : samplePrice(category.id, sample[0])), unit: '元/吨', note: '已汇总本周同品类有效报价', editor: ['沈佳宁', '陆文博'][ci % 2],
          status: index === 0 && ci < 3 ? ['pending', 'revision', 'reviewed'][ci] : 'reviewed',
          updatedAt: dateAfter(sample[0], 6) + ' ' + ['16:20:00', '16:35:00', '16:50:00'][ci % 3],
          version: 1, batchId: '', history: []
        };
        record.history.push({ action: '初始记录 · 周均采价归档', actor: record.editor, at: record.updatedAt,
          opinion: '已按本周有效报价范围汇总，等待后续维护或复核。', before: null, after: snapshot(record) });
        return record;
      });
    });
    if (app.scenarioData) app.scenarioData.prices(records, categories, weekOf, samplePrice);
    function validate(input, excludeId) {
      const value = {
        start: String(input.start || '').trim(), category: String(input.category || '').trim(),
        price: String(input.price == null ? '' : input.price).trim(), unit: String(input.unit || '').trim(),
        note: String(input.note || '').trim()
      };
      const errors = {};
      const date = new Date(value.start + 'T00:00:00Z');
      if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value.start) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.start || value.start > '9998-12-31') {
        errors.start = '请输入有效日期，格式为 YYYY-MM-DD。';
      } else if (date.getUTCDay() !== 1) errors.start = '请选择周一作为采价周起始日期。';
      if (!categories.some(function (category) { return category.id === value.category; })) errors.category = '请选择有效的分析品类。';
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(value.price) || Number(value.price) <= 0) errors.price = '价格须大于 0，最多 9 位整数、2 位小数。';
      if (value.unit !== '元/吨') errors.unit = '价格单位须为元/吨，请统一单位后导入。';
      if (value.note.length > 200) errors.note = '备注不能超过 200 字。';
      if (!errors.start && !errors.category && records.some(function (record) { return record.id !== excludeId && record.week.id === value.start && record.category.id === value.category; })) {
        errors.start = '该采价周与品类已有记录，请编辑原记录。';
      }
      return { value: value, errors: errors, valid: Object.keys(errors).length === 0 };
    }
    function save(input, id, batchId) {
      const check = validate(input, id);
      if (!check.valid) return check;
      const existing = id ? records.find(function (record) { return record.id === id; }) : null;
      if (id && !existing) return { valid: false, errors: { start: '记录不存在，请刷新列表。' } };
      const value = check.value;
      if (existing && existing.week.id === value.start && existing.category.id === value.category && existing.price === Number(value.price) && existing.note === value.note) return { valid: true, unchanged: true, record: existing };
      const record = existing || { id: 'price-' + (++serial), version: 0, history: [], batchId: batchId || '' };
      const before = existing ? snapshot(existing) : null;
      Object.assign(record, { week: weekOf(value.start), category: categories.find(function (category) { return category.id === value.category; }),
        price: Number(value.price), unit: value.unit, note: value.note, editor: actorName('沈佳宁'), status: 'pending', updatedAt: stamp(), version: record.version + 1 });
      record.history.push({ action: existing ? '编辑' : (batchId ? '批量导入' : '新增'), actor: record.editor, at: record.updatedAt,
        opinion: existing ? '修改后重新进入待复核。' : '等待人工复核。', before: before, after: snapshot(record) });
      if (!existing) records.push(record);
      return { valid: true, record: record };
    }
    function review(id, decision, opinion) {
      const record = records.find(function (item) { return item.id === id; });
      if (!record || record.status !== 'pending') return { valid: false, message: '仅待复核记录可复核，请刷新后重试。' };
      if (!['reviewed', 'revision'].includes(decision)) return { valid: false, message: '请选择复核结论。' };
      const text = String(opinion || '').trim();
      if (!text || text.length > 200) return { valid: false, message: '请填写 1–200 字复核意见。' };
      const before = snapshot(record);
      record.status = decision;
      record.updatedAt = stamp();
      record.history.push({ action: decision === 'reviewed' ? '复核通过' : '退回修改', actor: actorName('周明远'), at: record.updatedAt,
        opinion: text, before: before, after: snapshot(record) });
      return { valid: true, record: record };
    }
    function validateRows(rows) {
      const checked = rows.map(function (row) { return Object.assign({ line: row.line, raw: row.raw }, validate(row.input)); });
      const counts = new Map();
      checked.forEach(function (row) { const key = row.value.start + ':' + row.value.category; counts.set(key, (counts.get(key) || 0) + 1); });
      checked.forEach(function (row) {
        if (counts.get(row.value.start + ':' + row.value.category) > 1) row.errors.start = '文件内采价周与品类重复，请保留一条。';
        if (row.raw && row.raw.length !== headers.length) row.errors.columns = '列数不符，应为 5 列。';
        row.valid = Object.keys(row.errors).length === 0;
      });
      return checked;
    }
    function importRows(rows, filename) {
      const checked = validateRows(rows);
      if (!checked.length || checked.some(function (row) { return !row.valid; })) return { valid: false, rows: checked };
      const batch = { id: 'IMP-' + String(batches.length + 1).padStart(4, '0'), filename: filename, at: stamp(), actor: actorName('沈佳宁'), items: [] };
      checked.forEach(function (row) {
        const saved = save(row.value, null, batch.id);
        batch.items.push({ line: row.line, record: snapshot(saved.record) });
      });
      batches.unshift(batch);
      return { valid: true, batch: batch };
    }
    return { records: records, batches: batches, validate: validate, save: save, review: review, validateRows: validateRows, importRows: importRows };
  }

  // 严格处理 CSV 引号、双引号转义及引号内换行，并保留物理起始行号。
  function parseCSV(source) {
    const text = String(source).replace(/^\uFEFF/, '');
    const rows = [];
    let cells = [], field = '', quoted = false, closed = false, line = 1, startLine = 1;
    function pushField() { cells.push(field); field = ''; closed = false; }
    function pushRow() {
      pushField();
      if (cells.some(function (cell) { return cell.trim() !== ''; })) rows.push({ line: startLine, cells: cells });
      cells = [];
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; }
        } else { field += char; if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line++; }
      } else if (char === '"') {
        if (field || closed) throw new Error('第 ' + line + ' 行引号格式错误。');
        quoted = true;
      } else if (char === ',') pushField();
      else if (char === '\n' || char === '\r') {
        pushRow();
        if (char === '\r' && text[i + 1] === '\n') i++;
        line++; startLine = line;
      } else {
        if (closed) throw new Error('第 ' + line + ' 行结束引号后存在多余字符。');
        field += char;
      }
    }
    if (quoted) throw new Error('第 ' + startLine + ' 行引号未闭合。');
    if (field || cells.length || closed) pushRow();
    if (!rows.length || rows[0].cells.map(function (cell) { return cell.trim(); }).join('|') !== headers.join('|')) throw new Error('表头不匹配，请使用下载模板的 5 列表头及顺序。');
    if (rows.length === 1) throw new Error('文件只有表头，请填写至少一条采价记录。');
    if (rows.length > 501) throw new Error('单次最多导入 500 条，请拆分文件。');
    return rows.slice(1).map(function (row) {
      const cells = row.cells.map(function (cell) { return cell.trim(); });
      const category = categories.find(function (item) { return item.name === cells[1]; });
      return { line: row.line, raw: row.cells, input: { start: cells[0], category: category ? category.id : '', price: cells[2], unit: cells[3], note: cells[4] } };
    });
  }
  app.priceData = { categories: categories, statuses: statuses, headers: headers, weekOf: weekOf, dateAfter: dateAfter, parseCSV: parseCSV, createStore: createStore };
  // 本次打开页面内保存操作，切换菜单不丢失；刷新页面恢复初始记录。
  app.priceStore = createStore();
}());
