(function () {
  'use strict';
  const app = window.FrozenApp;
  const currentTime = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  // User-requested fictional history, used only in the record projection. Never queues jobs or creates reports.
  const rows = [
    ['week', currentTime, '2026-08-31', '2026-09-06', 'running', '执行中，正在检查本期数据', '正在核对本期采价、映射与市场汇总数据；执行完成后记录生成或等待结果。'],
    ['week', '2026-08-31 09:00:00', '2026-08-24', '2026-08-30', 'success', '已生成1份，进入待复核', '已完成12个品类的周均价及出入库、库存核对，生成V1；生成时进入待复核。'],
    ['week', '2026-08-24 09:05:00', '2026-08-17', '2026-08-23', 'success', '补生成成功，进入待复核', '生成服务恢复，第2次执行成功生成V1；沿用原计划期间，进入待复核。', 2, '2026-08-24 09:00:00'],
    ['week', '2026-08-24 09:00:00', '2026-08-17', '2026-08-23', 'failed', '处理超时，等待自动重试', '生成服务处理超时，本次未写入简报；保留本期任务，5分钟后自动重试。'],
    ['week', '2026-08-17 09:05:00', '2026-08-10', '2026-08-16', 'success', '已生成1份，进入待复核', '周度量价与品类范围核对完成，已生成V1，等待人工核对摘要、数值及来源。', 2, '2026-08-17 09:00:00'],
    ['week', '2026-08-17 09:00:00', '2026-08-10', '2026-08-16', 'waiting', '采价待复核，等待数据', '本期部分采价尚未复核，保留统计期间，5分钟后再次检查。'],
    ['week', '2026-08-10 09:00:00', '2026-08-03', '2026-08-09', 'success', '已生成1份，进入待复核', '已按上一完整周统计12个品类，保存生成时数据依据，进入待复核。'],
    ['week', '2026-08-03 09:05:00', '2026-07-27', '2026-08-02', 'success', '已有内容，跳过重复生成', '相同期间与品类范围已有简报，保留原有正文及版本，本次未创建新版本。', 2, '2026-08-03 09:00:00'],
    ['week', '2026-08-03 09:00:00', '2026-07-27', '2026-08-02', 'running', '正在核对周度量价数据', '正在核对12个品类的采价、映射及市场数量，尚未形成简报。'],
    ['month', '2026-09-01 09:00:00', '2026-08-01', '2026-08-31', 'waiting', '月末采价待复核，暂未生成', '8月31日属于2026-08-31采价周，鸡副、水产该周采价尚未复核，未形成完整月报。'],
    ['month', '2026-08-01 09:00:00', '2026-07-01', '2026-07-31', 'success', '已生成1份，进入待复核', '已按自然月汇总数量、月末库存及覆盖天数加权价格，生成V1；发布前仍需复核汇总限制。'],
    ['month', '2026-07-01 09:05:00', '2026-06-01', '2026-06-30', 'success', '补生成成功，进入待复核', '第2次执行完成6月月报，生成V1。该期间市场汇总存在发布限制，生成成功不代表允许发布。', 2, '2026-07-01 09:00:00'],
    ['month', '2026-07-01 09:00:00', '2026-06-01', '2026-06-30', 'failed', '汇总处理超时，等待重试', '月度汇总处理超时，本次未写入简报；保留原自然月期间，5分钟后自动重试。'],
    ['month', '2026-06-01 09:00:00', '2026-05-01', '2026-05-31', 'success', '已生成1份，进入待复核', '已完成5月自然月数量和加权价格汇总，生成V1，保存月度比较依据并进入待复核。'],
    ['month', '2026-05-01 09:01:00', '2026-04-01', '2026-04-30', 'success', '已生成1份，进入待复核', '4月完整期间汇总完成，生成V1并进入待复核；需要人工核对后单独发布。', 1, '2026-05-01 09:00:00'],
    ['month', '2026-05-01 09:00:00', '2026-04-01', '2026-04-30', 'running', '正在汇总自然月数据', '正在核对覆盖天数、月末库存与月度比较基期。']
  ];
  app.generationHistory = {
    records() {
      const target = app.categoryCatalog.grouped().map(c => c.name).join('、');
      const history = rows.map(([key, time, start, end, status, result, message, attempt = 1, scheduledAt = time]) => ({
        id: 'generation-history-' + key + '-' + time.replace(/[^0-9]/g, ''), origin: 'preset-history', key, time, status, result,
        details: [{ target, start, end, scheduledAt, configRevision: 1, attempt, status, message, recordId: null, version: null }]
      }));
      const reports = [
        ['report-week', currentTime, '2026-08-31', '2026-09-06', 'running', '执行中，正在按商户检查本周数据'],
        ['report-week', '2026-08-31 09:00:00', '2026-08-24', '2026-08-30', 'success', '已生成3份周报，进入待复核'],
        ['report-week', '2026-08-24 09:05:00', '2026-08-17', '2026-08-23', 'success', '补生成3份周报，进入待复核'],
        ['report-week', '2026-08-24 09:00:00', '2026-08-17', '2026-08-23', 'failed', '计算服务超时，等待自动重试'],
        ['report-week', '2026-08-10 09:05:00', '2026-08-03', '2026-08-09', 'partial', '已生成2份，1户等待数据'],
        ['report-week', '2026-08-10 09:00:00', '2026-08-03', '2026-08-09', 'waiting', '本户数量待核对，等待数据'],
        ['report-month', '2026-09-01 09:00:00', '2026-08-01', '2026-08-31', 'waiting', '部分采价待复核，暂不形成完整价格建议'],
        ['report-month', '2026-08-01 09:00:00', '2026-07-01', '2026-07-31', 'success', '已生成3份月报，进入待复核'],
        ['report-month', '2026-07-01 09:05:00', '2026-06-01', '2026-06-30', 'success', '补生成3份月报，进入待复核'],
        ['report-month', '2026-07-01 09:00:00', '2026-06-01', '2026-06-30', 'failed', '月度汇总超时，等待自动重试'],
        ['report-month', '2026-06-01 09:10:00', '2026-05-01', '2026-05-31', 'success', '已补齐3户月报，进入待复核'],
        ['report-month', '2026-06-01 09:05:00', '2026-05-01', '2026-05-31', 'partial', '已生成2份，1户等待数据'],
        ['report-month', '2026-06-01 09:00:00', '2026-05-01', '2026-05-31', 'running', '正在按商户汇总自然月数据']
      ].map(([key, time, start, end, status, result]) => ({ key, time, status, result, origin: 'preset-history',
        details: app.reportData.merchants.map((m, i) => {
          const kindName = key === 'report-month' ? '月报' : '周报';
          const detailStatus = status === 'partial' ? (i === 2 ? 'waiting' : 'success') : status;
          const messages = {
            success: '本户经营' + kindName + 'V1已生成，进入待复核。',
            running: '正在汇总' + m.name + '的本户数量、库存及市场参照。',
            waiting: key === 'report-month' ? '部分市场采价待复核，本户数量报告已保留，完整价格建议等待补齐。' : '部分市场采价待复核，保留本户统计期间并继续检查。',
            failed: '本户经营' + kindName + '计算未完成，保留原期间等待自动重试。'
          };
          return { target: m.name, start, end, scheduledAt: time.replace(/09:(05|10):/, '09:00:'), configRevision: 1, attempt: time.includes('09:10:') ? 3 : time.includes('09:05:') ? 2 : 1,
            status: detailStatus, message: messages[detailStatus] + '仅处理本户经营数据。', recordId: null, version: null };
        }) }));
      return history.concat(reports);
    }
  };
}());
