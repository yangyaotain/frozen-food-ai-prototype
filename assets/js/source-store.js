(function () {
  'use strict';
  const app = window.FrozenApp;
  const actorName = function (fallback) { return app.actor ? app.actor(fallback) : fallback; };
  const categories = app.priceData.categories;
  const types = app.newsTypes;
  const sourceStates = { pending: { name: '待确认', style: 'warning' }, confirmed: { name: '已确认', style: 'success' } };
  const itemStates = { pending: { name: '待核验', style: 'warning' }, verified: { name: '核验通过', style: 'success' }, rejected: { name: '核验不通过', style: 'danger' } };
  function stamp() { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function snapshot(value) { const result = Object.assign({}, value); delete result.history; return copy(result); }
  // Fictional editorial material; numbers are frozen from the existing seed data.
  function seedEditorial(item, source) {
    item.type = source.type;
    const entries = {
      'info-1': ['冷链商品交接记录指引：名称、产地与重量分栏留存', '本期冷链流通资料专栏梳理了冻品收发环节的单据衔接方式，重点关注商品名称、产地和净重记录在交接单与入出库记录之间的一致性。', '适用范围', '指引围绕鸡副商品的收货、库内移交和出库交付三个环节展开。原始商品名称随业务单据保留，分析品类用于统计归并；国产与进口分别记录，避免仅用简称覆盖产地信息。本文为业务资料整理，不替代具体商品适用的监管要求。', '资料衔接', '交接记录按批次标识、交接时间及重量逐项对应。发生退货、补录或重量调整时，原记录和调整原因一并留存；同一批次多次流转不重复计为新增到货。用于周度分析的数量以统一截止日汇总，记录跨周时需分别归入所属期间。'],
      'info-2': ['阶段性冻品标签核对安排到期，适用依据需更新', '归档材料中的标签核对安排适用至2026年8月25日。当前保存的展示稿仍沿用原安排，时间范围与本次信息有效性核对日期存在冲突。', '原文内容', '材料将商品名称、产地及批次标识列为重点核对项目，并约定阶段内逐批留存标签与交接资料。原安排已结束，不能继续当作现行要求发布；具体核对内容是否延续，尚缺新的有效依据。', '待解决事项', '本条需要取得后续材料，区分继续适用、调整和终止的条款。仅延长展示有效期不能消除原文过期问题。新依据应注明来源和适用日期，整理后的正文应清楚说明当前范围；无法取得时，保留原文并记录核验不通过。'],
      'info-3': ['鸡副餐饮备货观察：周度总量与品类结构需结合查看', '华东冻品流通周刊本期关注餐饮备货中的鸡副品类，分别梳理周度采购安排、库内周转及交付节奏。市场总量与单户备货结构呈现不同观察维度。', '渠道观察', '整箱交付与分批提货对应不同的仓储节奏。部分交付集中在周内固定时点，短期库存变化同时受到到货和提货安排影响。观察经营结构时，应保留鸡爪、鸡胗、冻鸡心等原始名称与产地信息，再按统一分析品类汇总重量。', '经营含义', '市场出库量可以用于观察流转规模，本户报告则反映各自库存与出库结构。订单规模、客户构成和履约时间不在本次统计范围内，因此市场变化不直接等同于某一商户的订单变化。'],
      'info-4': ['鸡副到货记录出现件数与净重两种口径', '同一组鸡副到货材料同时出现“到货1,260件”和“到货25.20吨”的描述，但未提供逐项包装规格及换算表，两个数值暂不能认定为同一范围。', '差异明细', '第一份摘要按件统计，未说明每件净重；第二份材料按重量统计，并包含补录记录。两份文件的截止日分别为8月25日和8月26日，既有单位差异，也存在期间差异，不能把两者直接比较或简单折算为增长率。', '核验路径', '需取得包装规格、原始重量记录和补录清单，统一为同一期间的净重后重新形成正文。当前保留两种表述作为原文依据，不将其计入已确认到货结论，也不据此判断供需增长。'],
      'info-5': ['第34周水产市场观察：价格、出库与期末库存', '水产到货与库存观察本期汇总2026年8月17日至23日的水产市场记录，分别呈现周均报价、期间流量和期末库存，供连续周比较使用。', '统计范围', '本期按冻带鱼段、巴沙鱼柳和南美白虾仁等已建立映射的原始名称归并，国产与进口保留各自来源属性。周均报价和数量汇总使用相同品类范围，但报价不是任一商户的实际成交价格。', '市场观察', '期末库存是周末时点值，入库与出库是整周累计值，三者应共同阅读。到货集中可能暂时推高库存，持续出库则会消化存量。判断变化是否持续，还需与前周和上年对应周比较，单周数据不用于确定后续价格。'],
      'info-6': ['进口水产到货消息缺少可核对的原始记录', '一则进口水产到货消息描述了两批次货物的预计入库安排，但现有材料只包含转述摘要，缺少与批次对应的交接记录和实际入库日期。', '已有材料', '摘要将预计到货和完成入库放在同一段表述中，未区分计划时间与实际业务时间；引用的重量没有明确标注为毛重或净重。当前无法确认是否存在重复引用，也不能据此认定新增供应已经进入市场。', '核验要求', '需要补充原始出处、批次标识、实际入库日期及净重记录，并区分计划、在途和已入库状态。当前材料保留待核验，不作为市场到货量或价格分析的已确认外部依据。'],
      'info-7': ['第35周鸡副周报：来源出库方向与平台口径对照', '禽类流通行情周报描述8月24日至30日鸡副出库较前一周增加。该方向性判断来自来源统计范围，需要与平台同期间已归并数量交叉核对。', '来源观察', '原文围绕周度出库方向展开，未给出可逐笔还原的完整出库清单。来源可能采用交付确认时间，平台采用业务记账期间，两种时间口径应先确认一致，再解释方向差异。', '对照结论', '平台量价分析保留同期间入库、出库及期末库存，可直接核对来源所述“出库增加”是否成立。若方向不一致，应记录范围差异，不把原文方向覆盖为平台结论；两边即使同向，也仅构成背景佐证。'],
      'info-8': ['鸡副周末库存摘要存在周五、周日两个截止日', '鸡副库存材料将8月28日周五余额与8月30日周日余额并列展示，但正文把二者都称为“本周期末库存”，期间含义不一致。', '差异明细', '周五余额未包含周末入库、出库及调整记录，周日余额则包含完整周业务。原摘要还沿用了周一至周五的出库合计，用该数值解释周日期末库存会造成勾稽不一致。', '处理要求', '需要补充周末两天记录，并按周一至周日重新核对期初加进减出与期末。统一截止日之前，本条不能作为库存积压或去库改善的依据；处理后的展示稿应同时标明完整统计期间。'],
      'info-9': ['进口猪副到货批次观察：批次数与净重分别统计', '进口冻品到港资讯本期梳理猪副商品的批次到货间隔，关注批次拆分、重量记录和入库日期之间的关系。批次数量与实际流入规模需分别观察。', '批次结构', '同一合同下的货物可能分批入库，也可能在一个到货批次中包含多个原始商品名称。资料按批次标识记录交接过程，统计时按统一品类归并净重，避免把多张单据当作多次新增到货。', '范围说明', '本条适用于进口猪副的来源资料观察。平台数量还包含其他已映射业务，不能用单一来源批次数替代市场汇总。资料发布前需先完成来源确认，来源确认通过后仍须单独发布资讯。'],
      'info-10': ['进口水产信息引用链不完整，来源确认尚未完成', '当前进口水产摘要引用了二次转述材料，原始出处和实际交接主体未能对应，来源资料尚未完成确认。', '缺失环节', '现有文本有到货时间描述，但没有原始发布地址、版本或批次对应关系。两次转述使用相近商品名称，无法判断是同一批货物还是不同记录，直接汇总可能重复计算。', '核验范围', '需取得原始出处并补齐来源说明，再核对其覆盖的品类与信息范围。来源确认完成不等于本条信息自动核验通过；原文、整理稿及处理依据应分别留存。'],
      'info-11': ['鸡副流转观察：入库与出库共同影响库存变化', '杭州冻品流通观察本期关注鸡副入库、出库及期末库存之间的关系，按统一重量口径呈现流转情况，避免以单一指标替代整体判断。', '观察方法', '入库与出库为期间累计，期末库存为截止日余额。两者差额体现库存净变化，需结合期初库存共同核对。已映射原始名称统一归组，未映射记录在完成口径确认前不参与分类汇总。', '适用边界', '市场汇总不展示单户经营明细，也不用于反推某一商户库存。不同品类的价格水平不可直接平均；本条只说明鸡副范围内的变化，应结合相同期间采价和连续周记录阅读。'],
      'info-12': ['水产库存材料的期初日期与出库期间错位一周', '水产库存材料采用8月17日期初余额，但出库合计对应8月24日至30日，两个期间相差一周，现有摘要无法完成库存勾稽。', '问题明细', '原文遗漏8月17日至23日的入出库变化，把较早期初与下一周期末直接相连。这种计算会将中间一周流量误计为盘点差异，也可能改变库存增减方向。', '补充依据', '应补齐连续两周记录，分别核对各周的期初、入库、出库和期末，再按选定期间汇总。未取得连续数据前保留问题材料，不依据该摘要判断库存积压。']
    };
    const category = categories.find(function (c) { return c.id === item.categories[0]; });
    const entry = entries[item.id] || [
      '第34周' + category.name + '行情观察：报价与库存结构',
      source.name + '本期整理2026年8月17日至23日' + category.name + '业务记录，按统一分析品类对报价、流量和库存进行对照，保留原始商品名称及产地信息。',
      '品类观察', item.content,
      '统计口径', '本期资料按已映射商品名称归并，数量统一为吨。原始记录中的不同名称不重复计数，国产与进口分别留存来源属性。期间入出库采用累计值，库存使用截止日余额，价格使用已复核周均报价。',
      '适用范围', '本条用于理解' + category.name + '的市场变化，不代表单户成交或订单情况。观察价格方向时同时核对连续周出库与库存，经营安排还需结合本户履约、库存结构及客户需求。'
    ];
    item.title = entry[0];
    const paragraphs = [entry[1]];
    for (let i = 2; i < entry.length; i += 2) paragraphs.push(entry[i] + '\n' + entry[i + 1]);
    if (!item.issueType && source.type !== 'policy') {
      const week = '2026-08-17', priorWeek = '2026-08-10';
      const price = app.priceStore.records.find(function (r) { return r.week.id === week && r.category.id === category.id && r.status === 'reviewed'; });
      const prior = app.priceStore.records.find(function (r) { return r.week.id === priorWeek && r.category.id === category.id && r.status === 'reviewed'; });
      if (price) {
        let facts = '截至8月23日的第34周，平台已复核' + category.name + '周均价为' + price.price.toFixed(2) + '元/吨' + (prior ? '，较前周' + (price.price >= prior.price ? '上升' : '下降') + Math.abs((price.price - prior.price) / prior.price * 100).toFixed(2) + '%' : '') + '。';
        if (app.scenarioData && app.categoryStore) {
          const rawIds = app.categoryStore.records.filter(function (r) { return r.categoryId === category.id; }).map(function (r) { return r.id; });
          const rows = app.scenarioData.marketFlows(app.categoryStore.records).filter(function (r) { return r.week === week && rawIds.includes(r.rawId); });
          const sum = function (key) { return rows.reduce(function (n, r) { return n + r[key]; }, 0).toFixed(2); };
          facts += '同周入库' + sum('inbound') + '吨、出库' + sum('outbound') + '吨，期末库存' + sum('closing') + '吨。';
          item.platformFacts = { week: week, categoryId: category.id, price: price.price, inbound: Number(sum('inbound')), outbound: Number(sum('outbound')), closing: Number(sum('closing')) };
        }
        paragraphs.splice(1, 0, '平台同品类参照\n' + facts + '平台参照与来源观察分别留存，适用期间以各段注明日期为准。');
      }
    }
    item.content = paragraphs.join('\n\n'); item.displayTitle = item.title; item.displayContent = item.content;
    if (app.scenarioData && item.id === 'info-7') item.publishedAt = '2026-08-30 18:00:00';
    if (app.scenarioData && item.issueType) item.abnormal = ({ expired: '原安排截至8月25日，缺少后续有效依据', conflict: '1,260件与25.20吨口径及截止日不一致', unverifiable: '缺少实际入库日期及原始重量记录', period: item.id === 'info-8' ? '周五余额与周日期末混用' : '期初与出库期间错位一周', source: '缺少可确认的原始出处和批次关系' })[item.issueType] || item.abnormal;
    item.seedOpinion = item.status === 'verified' ? '已核对原文地址、发布时间及' + category.name + '适用范围；正文与来源版本V' + source.version + '一致。' + (item.platformFacts ? '平台参照采用8月17日至23日已复核价格及同周数量，来源观察不替代平台统计。' : '本条按资料说明范围采用，不扩展为未记载的要求。') : '已登记原文地址、发布时间与适用品类。' + (item.abnormal ? '待核对：' + item.abnormal + '。补齐依据前保持未发布。' : '来源确认及信息核验仍需分别完成。');
  }
  function createStore() {
    const seeds = [
      ['冷链政策与标准信息库', 'policy', ['poultry', 'seafood', 'pork'], '政策发布与适用品类说明', 'confirmed'],
      ['华东冻品流通周刊', 'industry', ['poultry', 'pork'], '行业动态与品类资讯', 'confirmed'],
      ['水产到货与库存观察', 'market', ['seafood'], '水产供需与市场信息', 'confirmed'],
      ['禽类流通行情周报', 'market', ['poultry'], '鸡副价格及供需信息', 'confirmed'],
      ['进口冻品到港资讯', 'industry', ['pork', 'seafood'], '进口冻品来源与行业信息', 'pending'],
      ['杭州冻品流通观察', 'market', ['poultry', 'seafood', 'pork'], '冻品市场汇总信息', 'pending']
    ];
    seeds.push(['禽肉与副产品行情', 'market', ['chicken', 'duck', 'duck-offal'], '禽肉与鸭副的到货、出库及库存观察', 'confirmed'],
      ['畜肉流通与库存观察', 'market', ['pork-meat', 'beef', 'beef-offal', 'lamb', 'lamb-offal'], '猪牛羊肉及副产品的周度流量观察', 'confirmed'],
      ['调理食品渠道观察', 'industry', ['prepared'], '速冻调理品备货结构与周转信息', 'confirmed']);
    const scopeDetails = ["冷链收发货资料、商品标签与交接记录的业务解读，覆盖鸡副、水产、猪副。按材料注明的适用期间归档；不将行业解读替代正式政策原文。","鸡副与猪副的餐饮渠道备货、批次交付和品类结构观察，区分市场统计与本户经营信息，保留报道期间及原始出处。","水产及水产品的周度报价、到货净重、出库节奏与库存观察，国产与进口保留来源属性；预计到货与实际入库分别描述。","鸡副周度行情及出库方向观察，注明统计起止日、数量单位与原文口径；与平台同期间量价交叉核对后采用。","进口猪副和水产的批次到货、交接来源及行业动态，核对原始发布地址和批次记录，不以转述认定完成入库。","鸡副、水产、猪副的入出库及库存变化观察，按完整周区分期间累计量和期末余额，保留统计期间差异说明。","鸡肉、鸭肉及鸭副的周度价格、产地结构和周转观察，保留原始商品名称，按已确认映射及统一重量口径汇总。","猪肉、牛肉、牛副、羊肉及羊副的周度报价、库存结构与季节观察，各品类独立统计，不跨品类合成平均价格。","速冻调理品的渠道备货、包装规格与库存周转信息，按净重口径观察流量，区分市场汇总与单户订单变化。"];
    seeds.forEach(function (seed, index) { seed[3] = scopeDetails[index]; });
    const sources = seeds.map(function (seed, index) {
      const source = { id: 'src-' + (index + 1), name: seed[0], type: seed[1], categories: seed[2], scope: seed[3],
        url: 'https://source-' + (index + 1) + '.example.com/', status: seed[4], version: 1,
        editor: '沈佳宁', updatedAt: '2026-09-07 09:00:00', history: [] };
      source.history.push({ action: '初始来源记录', actor: '沈佳宁', at: source.updatedAt, opinion: '已登记来源网站、栏目范围及适用品类。' + (source.status === 'confirmed' ? '已核对资料版本与涵盖范围，后续资讯逐篇核验。' : '原始出处与覆盖范围待进一步确认，关联信息暂不作为已确认依据。'), before: null, after: snapshot(source) });
      return source;
    });
    const items = sources.flatMap(function (source, index) {
      if (index >= 6) return source.categories.map(function (id) {
        const category = categories.find(function (c) { return c.id === id; });
        const observations = {
          chicken: ['鸡肉分批到货与出库节奏观察', '鸡肉到货由集中到货转为分批交接，应对照同周净重与出库量核对库存变化。分批次数增多不等于入库总量增加。'],
          duck: ['鸭肉餐饮备货与库存结构观察', '鸭肉流转记录中整箱与拆分交接并存，需统一净重后比较周度出库，不能仅按件数推断备货需求。'],
          'duck-offal': ['鸭副产地结构与报价口径核对', '鸭副报价受到产地与规格组合影响。比较周均价时应保持统计范围一致，并结合出库与期末库存判断变化。'],
          'pork-meat': ['猪肉入库批次与周转观察', '猪肉入库应按业务期间核对重量，集中入库造成的期末库存上升需要结合后续出库观察，不直接视为滞销。'],
          beef: ['牛肉产地组合与价格观察', '牛肉不同产地和规格报价存在差异。本期价格比较应同时核对品类映射及报价覆盖范围，避免把结构变化解释为全面涨跌。'],
          'beef-offal': ['牛副出库结构与库存核对', '牛副周度出库应与期初及期末库存共同核对。不同原始名称归并后按净重汇总，不能重复累加同一业务记录。'],
          lamb: ['羊肉季节备货与连续周观察', '羊肉备货存在期间差异，需将本期数量与上年对应周及近期连续周共同对照。单周增量不能直接确认季节性需求。'],
          'lamb-offal': ['羊副到货间隔与出库观察', '羊副不同批次到货间隔变化可能影响周末库存，应核对统计截止日与出库期间，避免错位比较。'],
          prepared: ['速冻调理品渠道备货结构观察', '速冻调理品覆盖不同包装与规格，流量比较需统一重量口径。渠道备货调整应结合本户库存和出库核对，不能由市场总量直接确定单户采购。']
        };
        const copyText = observations[id];
        const item = { id: 'info-cat-' + id, sourceId: source.id, sourceSnapshot: snapshot(source), categories: [id],
          title: copyText[0], content: copyText[1], displayTitle: copyText[0], displayContent: copyText[1],
          publishedAt: '2026-08-27 10:00:00', validThrough: '2026-09-30', infoUrl: source.url + 'articles/' + id + '.html',
          context: '适用于' + category.name + '，结合相同期间量价与库存核对，不直接形成经营决策。',
          abnormal: '', issueType: '', resolution: '', status: 'verified', verifiedSourceVersion: 1, version: 1, publication: null, releaseVersion: 0, history: [] };
        seedEditorial(item, source);
        item.history.push({ action: '初始信息记录', actor: '沈佳宁', at: item.publishedAt, opinion: item.seedOpinion, before: null, after: snapshot(item) });
        return item;
      });
      return [0, 1].map(function (offset) {
        const abnormal = offset === 1 ? ['适用品类描述不完整', '引用发布时间不一致', '数量单位缺失', '摘要与原文描述存在差异', '来源尚未确认', '统计期间未注明'][index] : '';
        const item = { id: 'info-' + (index * 2 + offset + 1), sourceId: source.id, sourceSnapshot: snapshot(source),
          title: source.name + ' · ' + (offset ? '待核验信息' : '信息摘要'), categories: [source.categories[offset % source.categories.length]],
          publishedAt: (app.scenarioData ? '2026-08-' + (24 + index) : '2026-09-0' + (6 + offset)) + ' 10:00:00',
          content: '本条信息汇总来源资料、发布时间及适用品类。\n内容范围：' + source.scope + '。\n' + (abnormal ? '待核对事项：' + abnormal + '。需人工核对依据后给出结论。' : '摘要依据来源资料整理，供核验及行情分析时参考。'),
          abnormal: abnormal, status: source.status === 'confirmed' && !offset ? 'verified' : 'pending',
          verifiedSourceVersion: source.status === 'confirmed' && !offset ? 1 : null, version: 1, publication: null, releaseVersion: 0, history: [] };
        if (app.scenarioData) {
          const titles = ['冷链商品交接记录要求的政策解读', '冻品标签记录适用期限核对', '餐饮备货结构变化观察', '鸡副到货口径存在来源差异', '水产到货节奏与出库结构观察', '进口水产到货消息待核实', '禽类冻品周度出库节奏观察', '鸡副统计期间补充说明', '进口猪副到货批次观察', '进口商品来源交接信息核对', '冻品市场多品类库存变化', '跨周库存统计期间核对'];
          const contents = ['冻品交接资料核对重点包括冻品交接时的名称、产地、批次及重量记录。适用于鸡副交接资料核对。建议核对现有交接记录是否完整，无法据此判断商品合规结论。', '本条目描述一项阶段性标签核对安排，原安排已结束，不能继续当作现行要求发布。请补充当前有效依据后重新核验。', '本周刊观察到餐饮备货在不同品类间调整。该信息只能作为经营结构的背景，需与本户品类出库量及库存共同核对，不能直接推导采购增减。', '两份记录分别采用到货件数和净重口径，无法直接比较。需统一单位与期间，并说明采用哪份留档作为发布依据。', '本水产供需记录显示到货集中在周中，出库分布较分散。到货时点与期末库存不是同一指标，应结合周入出库和库存变化理解，暂不作价格预测。', '该消息暂缺可交叉核对的到货记录。完成来源核对前不作为行情依据，无法证实则核验不通过。'];
          contents.push('本禽类周报观察到鸡副出库在前半周集中，后半周回落。周合计变化可能由交付日调整产生，需对照连续周出库与周末库存判断是否持续去库；不将一次集中出库视为需求全面增长。', '两份鸡副库存摘要分别截至周五与周日，不能直接比较期末库存。补齐同一统计日后再核对入出库与库存勾稽，当前信息只作待核对材料。', '本进口猪副记录关注不同批次到货间隔。批次数增加不等同总重量增长；需核对净重、入库日期及品类归并结果，不据到货批次数推断行情涨跌。', '本进口水产摘要缺少可确认的交接来源，不能仅根据转述认定到货已完成。需补充来源说明并确认该来源覆盖的品类范围，无法确认则不作为已核验资讯发布。', '本市场观察比较鸡副出库与库存的同步变化：入库集中时库存可能短期上升，需连续观察出库是否消化增量。该描述为市场汇总观察，不指向单户经营状况。', '本水产周报引用的期初库存与出库期间相差一周。应先统一周一至周日口径，核对期初加进减出与期末是否一致，不能用错位期间说明库存积压。');
          item.context = ['提供交接资料范围，不能直接推出需求变化。', '阶段性安排已经结束，需要新的有效依据。', '解释不同品类备货结构，不能以总出库替代结构核对。', '到货件数与净重口径不一致，先核对单位。', '到货时点集中，需结合周出库与期末库存。', '到货消息缺乏交叉核对，当前不能采用。', '说明鸡副周度出库方向，核对同期间统计口径。', '周五与周日期末不能直接比较。', '到货批次数不等于重量增长。', '交接来源尚未确认，不能将转述视为已到货。', '连续周库存变化提供市场背景。', '期初与出库期间错位时不能推导库存积压。'][index * 2 + offset];
          if (item.id === 'info-7') { item.signal = { metric: 'outbound', direction: 'up', start: '2026-08-24', end: '2026-08-30' }; contents[6] = '本禽类周报描述2026-08-24至08-30鸡副出库较前一周增加。该来源记录同期间的变化方向，需要与平台已归并鸡副数量交叉核对；如方向不一致，应检查统计范围和口径，不直接推断需求增长。'; }
          item.infoUrl = source.url + 'articles/' + item.id + '.html';
          if (item.id === 'info-4') item.categories = ['poultry'];
          item.title = titles[index * 2 + offset]; item.content = contents[index * 2 + offset] || '本行业观察涉及' + source.scope + '，请结合2026年8月的周均采价、出入库及库存共同判断。记录用于观察变化，不直接形成采购或价格决策。';
          item.displayTitle = item.title; item.displayContent = item.content; item.validThrough = index === 0 && offset === 1 ? '2026-08-25' : '2026-09-30';
          item.issueType = offset ? ['expired', 'conflict', 'unverifiable', 'period', 'source', 'period'][index] : ''; item.resolution = '';
        }
        seedEditorial(item, source);
        item.history.push({ action: '初始信息记录', actor: '沈佳宁', at: item.publishedAt, opinion: item.seedOpinion, before: null, after: snapshot(item) });
        return item;
      });
    });
    function find(id) { return sources.find(function (source) { return source.id === id; }); }
    function findItem(id) { return items.find(function (item) { return item.id === id; }); }
    function newsPublished() {
      return items.filter(function (item) { return item.publication && eligible(item) && item.publication.version === item.version && item.publication.source.version === find(item.sourceId).version; }).map(function (item) { return copy(item.publication); });
    }
    function syncNews() { if (app.newsData) app.newsData.write(newsPublished()); }
    function publish(id, version, sourceVersion) {
      const item = findItem(id);
      if (!item || item.version !== version || find(item.sourceId).version !== sourceVersion) return { valid: false, message: '信息或来源版本已变化，请重新打开。' };
      if (!eligible(item)) return { valid: false, message: '请先确认来源并逐篇核验通过，再发布资讯。' };
      if (item.publication) return { valid: false, message: '当前信息版本已发布，无需重复发布。' };
      const source = find(item.sourceId), before = snapshot(item);
      const review = item.history.slice().reverse().find(function (h) { return h.action === '核验通过'; });
      item.releaseVersion++;
      item.publication = { id: item.id, status: 'published', title: item.displayTitle || item.title, content: item.displayContent || item.content, type: item.type,
        categories: item.categories.map(function (id) { const c = categories.find(function (category) { return category.id === id; }); return { id: c.id, name: c.name }; }),
        validThrough: item.validThrough, sourcePublishedAt: item.publishedAt, version: item.version, source: { name: source.name, url: source.url, version: source.version },
        verification: { actor: review ? review.actor : '复核员', time: review ? review.at : item.history[0].at },
        publication: { actor: actorName('发布员'), time: stamp(), version: item.releaseVersion } };
      item.history.push({ action: '资讯发布', actor: actorName('发布员'), at: item.publication.publication.time,
        opinion: '逐篇核验通过后人工发布，发布版本 V' + item.releaseVersion + '。', sourceVersion: source.version, before: before, after: snapshot(item) });
      syncNews(); return { valid: true, item: item };
    }
    function querySources(filters) {
      const keyword = String(filters.keyword || '').trim().toLowerCase();
      return sources.filter(function (source) { return (!filters.category || source.categories.includes(filters.category)) && (!filters.status || source.status === filters.status) &&
        (!keyword || (source.name + ' ' + source.url).toLowerCase().includes(keyword)); });
    }
    function publicationState(item) {
      if (item.publication) return 'published';
      if (eligible(item)) return 'ready';
      return item.releaseVersion ? 'paused' : 'unpublished';
    }
    function queryItems(filters) {
      const keyword = String(filters.keyword || '').trim().toLowerCase();
      return items.filter(function (item) { return (!filters.sourceId || item.sourceId === filters.sourceId) && (!filters.category || item.categories.includes(filters.category)) &&
        (!filters.type || item.type === filters.type) && (!filters.publication || publicationState(item) === filters.publication) &&
        (!filters.status || item.status === filters.status) && (!filters.abnormal || Boolean(item.abnormal)) &&
        (!keyword || (item.title + ' ' + (item.displayTitle || '') + ' ' + find(item.sourceId).name).toLowerCase().includes(keyword)); });
    }
    function save(input, id, expectedVersion) {
      const current = id ? find(id) : null;
      const value = { name: String(input.name || '').trim(), type: String(input.type || ''), url: String(input.url || '').trim(),
        scope: String(input.scope || '').trim(), categories: Array.isArray(input.categories) ? Array.from(new Set(input.categories)).sort() : [] };
      const errors = {};
      if (id && (!current || current.version !== expectedVersion)) errors.name = '来源已变化，请关闭后重新打开。';
      if (!value.name || value.name.length > 60) errors.name = '请填写 1–60 字来源名称。';
      if (!Object.prototype.hasOwnProperty.call(types, value.type)) errors.type = '请选择有效的默认资讯分类。';
      if (!value.scope || value.scope.length > 200) errors.scope = '请填写 1–200 字信息范围。';
      if (!value.categories.length || value.categories.some(function (id) { return !categories.some(function (category) { return category.id === id; }); })) errors.categories = '请至少选择一个有效品类。';
      try {
        const url = new URL(value.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || value.url.length > 300) throw new Error();
        url.hash = ''; value.url = url.href;
      } catch (_) { errors.url = '请输入不含账号密码的 HTTP 或 HTTPS 地址，最多 300 字。'; }
      if (sources.some(function (source) { return source.id !== id && source.name.toLowerCase() === value.name.toLowerCase(); })) errors.name = '来源名称已存在，请编辑原来源。';
      if (!errors.url && sources.some(function (source) { return source.id !== id && source.url === value.url; })) errors.url = '来源地址已存在，请编辑原来源。';
      if (Object.keys(errors).length) return { valid: false, errors: errors };
      if (current && ['name', 'type', 'url', 'scope'].every(function (key) { return current[key] === value[key]; }) && current.categories.slice().sort().join('|') === value.categories.join('|')) return { valid: true, unchanged: true, source: current };
      const source = current || { id: 'src-' + (sources.length + 1), version: 0, history: [] };
      const before = current ? snapshot(source) : null;
      Object.assign(source, value, { status: 'pending', version: source.version + 1, updatedAt: stamp(), editor: actorName('维护员') });
      source.history.push({ action: current ? '编辑来源' : '新增来源', actor: source.editor, at: source.updatedAt, opinion: '等待来源确认。', before: before, after: snapshot(source) });
      if (!current) sources.unshift(source);
      else items.filter(function (item) { return item.sourceId === id; }).forEach(function (item) {
        const previous = snapshot(item);
        item.status = 'pending'; item.verifiedSourceVersion = null; item.publication = null; item.version++;
        item.history.push({ action: '来源变更，重新核验', actor: source.editor, at: source.updatedAt, opinion: '来源版本已更新为 V' + source.version + '，原核验结论留存，当前信息需重新核验。', before: previous, after: snapshot(item) });
      });
      syncNews(); return { valid: true, source: source };
    }
    function confirm(id, version, opinion) {
      const source = find(id);
      const text = String(opinion || '').trim();
      if (!source || source.version !== version || source.status !== 'pending') return { valid: false, message: '来源状态已变化，请重新打开。' };
      if (!text || text.length > 200) return { valid: false, message: '请填写 1–200 字确认依据。' };
      const before = snapshot(source);
      source.status = 'confirmed'; source.updatedAt = stamp();
      source.history.push({ action: '确认来源', actor: actorName('核验员'), at: source.updatedAt, opinion: text, before: before, after: snapshot(source) });
      return { valid: true, source: source };
    }
    function verify(id, version, decision, opinion, displayChecked) {
      const item = findItem(id);
      const text = String(opinion || '').trim();
      if (!item || item.version !== version || item.status !== 'pending') return { valid: false, message: '信息状态已变化，请重新打开。' };
      const source = find(item.sourceId);
      if (!['verified', 'rejected'].includes(decision)) return { valid: false, message: '请选择核验结论。' };
      if (!text || text.length > 200) return { valid: false, message: '请填写 1–200 字核验依据或不通过原因。' };
      if (decision === 'verified' && source.status !== 'confirmed') return { valid: false, message: '请先确认来源，再将信息标记为核验通过。' };
      if (decision === 'verified' && !Object.prototype.hasOwnProperty.call(types, item.type)) return { valid: false, message: '请先在整理展示稿中选择有效资讯分类。' };
      if (decision === 'verified' && item.validThrough && item.validThrough < '2026-09-06') return { valid: false, message: '资讯在数据截至日2026-09-06已过期，请补充有效依据和展示稿；不能直接核验通过。' };
      if (decision === 'verified' && app.scenarioData && /待核实|待核验|待确认/.test((item.displayTitle || '') + (item.displayContent || ''))) return { valid: false, message: '展示稿仍含未完成核验的提示，请整理为核验后的业务内容或选择核验不通过。' };
      if (decision === 'verified' && item.issueType && !item.resolution) return { valid: false, message: '请先通过“整理展示稿”填写核验处理说明，说明问题如何解决。' };
      if (decision === 'verified' && app.scenarioData && item.issueType) {
        if (!['updated', 'corrected'].includes(item.treatment)) return { valid: false, message: '问题尚未解决；请整理处理方式和展示稿，或核验不通过。' };
        if (['expired', 'conflict', 'unverifiable', 'period', 'source'].includes(item.issueType) && item.displayContent.trim() === item.content.trim()) return { valid: false, message: '问题原文仍原样用于展示，请将核实后的结果整理为展示正文；原始问题材料继续留档。' };
        if (item.issueType === 'expired' && (item.treatment !== 'updated' || item.displayContent.trim() === item.content.trim() || /原安排已结束|不能继续当作现行|请补充当前有效依据/.test(item.displayContent))) return { valid: false, message: '过期资讯必须更新为有依据的现行展示稿，不能只延长日期；原文仍保留留档。' };
        if (displayChecked !== true) return { valid: false, message: '通过前请确认已逐项核对处理方式、有效依据和实际展示稿的一致性。' };
      }
      if (decision === 'verified' && !item.categories.every(function (category) { return source.categories.includes(category); })) return { valid: false, message: '信息品类超出当前来源范围，请核对来源范围后再核验。' };
      const before = snapshot(item);
      item.status = decision; item.verifiedSourceVersion = decision === 'verified' ? source.version : null; item.version++;
      item.history.push({ action: decision === 'verified' ? '核验通过' : '核验不通过', actor: actorName('核验员'), at: stamp(), opinion: text,
        sourceVersion: source.version, before: before, after: snapshot(item) });
      syncNews(); return { valid: true, item: item };
    }
    function eligible(item) {
      const source = find(item.sourceId);
      return Boolean(source && Object.prototype.hasOwnProperty.call(types, item.type) && source.status === 'confirmed' && item.status === 'verified' && (!item.validThrough || item.validThrough >= '2026-09-06') && item.verifiedSourceVersion === source.version && item.categories.every(function (id) { return source.categories.includes(id); }));
    }
    function flag(id, version, reason) {
      const item = findItem(id);
      const text = String(reason || '').trim();
      if (!item || item.version !== version) return { valid: false, message: '信息已变化，请重新打开。' };
      if (!text || text.length > 200) return { valid: false, message: '请填写 1–200 字异常原因。' };
      const before = snapshot(item);
      if (app.scenarioData) { item.issueType = '人工标记异常'; item.resolution = ''; }
      item.abnormal = text; item.status = 'pending'; item.verifiedSourceVersion = null; item.publication = null; item.version++;
      item.history.push({ action: '标记异常，转人工核验', actor: actorName('维护员'), at: stamp(), opinion: text, before: before, after: snapshot(item) });
      syncNews(); return { valid: true, item: item };
    }
    function editDisplay(id, version, input) {
      const item = findItem(id), title = String(input.title || '').trim(), content = String(input.content || '').trim(), resolution = String(input.resolution || '').trim(), until = String(input.until || '');
      const date = new Date(until + 'T00:00:00Z');
      if (!item || item.version !== version) return { valid: false, message: '信息已变化，请重新打开。' };
      // Omitted classification preserves existing callers and the article's own choice.
      const type = input.type === undefined ? item.type : String(input.type);
      if (!Object.prototype.hasOwnProperty.call(types, type)) return { valid: false, message: '请选择有效资讯分类。' };
      const treatment = input.treatment || item.treatment || (content !== item.content && item.issueType === 'expired' ? 'updated' : item.issueType ? 'unresolved' : 'corrected');
      if (type === item.type && title === (item.displayTitle || item.title) && content === (item.displayContent || item.content) && resolution === (item.resolution || '') && until === (item.validThrough || '') && treatment === (item.treatment || (item.issueType ? 'unresolved' : 'corrected'))) return { valid: true, unchanged: true, item: item };
      if (!['updated', 'corrected', 'unresolved'].includes(treatment)) return { valid: false, message: '请选择有效处理方式。' };
      if (!title || title.length > 100 || !content || content.length > 3000 || !resolution || resolution.length > 500 || !/^\d{4}-\d{2}-\d{2}$/.test(until) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== until) return { valid: false, message: '请填写标题1–100字、正文1–3000字、处理依据1–500字及有效截止日期。' };
      const before = snapshot(item); Object.assign(item, { type: type, signal: null, context: '采用人工整理后的展示内容，需按实际期间与指标重新核对，不沿用原文方向判断。', treatment: treatment, displayTitle: title, displayContent: content, resolution: resolution, validThrough: until, status: 'pending', verifiedSourceVersion: null, publication: null, version: item.version + 1 });
      item.history.push({ action: '整理展示稿，重新核验', actor: actorName('维护员'), at: stamp(), opinion: resolution, before: before, after: snapshot(item) }); syncNews(); return { valid: true, item: item };
    }
    return { sources: sources, items: items, find: find, findItem: findItem, querySources: querySources, queryItems: queryItems, publicationState: publicationState, save: save, confirm: confirm, verify: verify, flag: flag, eligible: eligible, publish: publish, editDisplay: editDisplay, newsPublished: newsPublished };
  }
  app.sourceData = { categories: categories, types: types, sourceStates: sourceStates, itemStates: itemStates, createStore: createStore };
  app.sourceStore = createStore();
  if (app.newsData) app.newsData.write(app.sourceStore.newsPublished());
}());
