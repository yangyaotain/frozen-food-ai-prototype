(function () {
  'use strict';
  window.FrozenApp = window.FrozenApp || {};
  window.FrozenApp.config = {
    admin: {
      label: '市场管理端',
      routes: [
        { id: 'prices', group: '数据维护', title: '每周平均采价', icon: 'price', description: '重点品类每周平均价格及历史记录。', requirements: ['A1'] },
        { id: 'categories', group: '数据维护', title: '品类映射', icon: 'grid', description: '原始品类与分析品类的统一口径。', requirements: ['A2', 'S1'] },
        { id: 'sources', group: '数据维护', title: '行业资讯', icon: 'source', description: '资讯分类、展示稿核验发布与来源管理。', requirements: ['A3'] },
        { id: 'analysis', group: '分析与发布', title: '市场量价分析', icon: 'chart', description: '价格、出入库量与库存的市场汇总分析。', requirements: ['P1', 'S1'] },
        { id: 'bulletins', group: '分析与发布', title: '市场行情简报', icon: 'report', description: '周度或月度行情简报的复核、发布与修订。', requirements: ['A4', 'P2', 'S2', 'S4'] },
        { id: 'reports', group: '分析与发布', title: '商户经营报告', icon: 'report', description: '商户专属经营分析及建议的复核与发布。', requirements: ['A4', 'P3', 'P4', 'S3'] },
        { id: 'trace', group: '过程追溯', title: '追溯记录', icon: 'history', description: 'AI 生成、人工复核、发布和修订的过程记录。', requirements: ['S2', 'S4'] },
        { id: 'users', group: '系统管理', title: '用户管理', icon: 'user', description: '管理用户资料、角色分配与账号状态。', requirements: ['S3', 'U01'] },
        { id: 'roles', group: '系统管理', title: '角色管理', icon: 'shield', description: '管理角色及页面、操作权限。', requirements: ['S3', 'U01'] }
      ]
    },
    merchant: {
      label: '商户小程序端',
      routes: [
        { id: 'news', title: '行业资讯', icon: 'source', description: '行业时事、政策变化与供需信息。', requirements: ['M1'] },
        { id: 'market', title: '市场行情', icon: 'chart', description: '已发布的市场行情与整体趋势。', requirements: ['M1', 'M4', 'P1', 'P2', 'S3'] },
        { id: 'reports', title: '经营报告', icon: 'report', description: '本户经营明细、专属分析与报告更新。', requirements: ['M2', 'M4', 'P3', 'S3'] },
        { id: 'advice', title: '经营建议', icon: 'bulb', description: '结合本户数据与市场行情的经营参考。', requirements: ['M3', 'P4', 'S2', 'S4'] },
        { id: 'profile', title: '我的', icon: 'user', description: '本户商户资料与经营内容。', requirements: ['M4', 'U02'] }
      ]
    }
  };
}());
