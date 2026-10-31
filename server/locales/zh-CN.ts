import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  srm: {
    notifications: {
      pending: '供应商准入待审核',
      approved: '供应商准入已通过',
      rejected: '供应商申请已驳回',
      body: '{{company}} · 第 {{version}} 版 · 时间 {{time}}。{{comment}}',
    },
  },
};

export default zhCN;
