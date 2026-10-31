import srm from './srm-zh-CN.js';
import approvalUi from '../extensions/nocobase-approval-ui/locales/zh-CN.js';
import { approvalLocaleZhCN as approval } from '@nocobase/app-plugin-approval/client';
import fileUi from '../extensions/nocobase-file-component-ui/locales/zh-CN.js';
import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  listFeedback: {
    loading: '加载中',
    empty: '暂无数据',
    noResults: '无结果',
    forbidden: '无权访问',
    unauthenticated: '会话已过期',
    failed: '列表加载失败',
    refreshFailed: '刷新失败，仍显示旧数据',
    retry: '重试',
    retrying: '正在重试…',
    clear: '清空筛选',
    signIn: '登录',
  },

  ...fileUi,
  ...approvalUi,
  approval: approval.approval,
  srm,
};

export default zhCN;
