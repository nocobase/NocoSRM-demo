import srm from './srm-en-US.js';
import approvalUi from '../extensions/nocobase-approval-ui/locales/en-US.js';
import { approvalLocaleEnUS as approval } from '@nocobase/app-plugin-approval/client';
import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  listFeedback: {
    loading: 'Loading',
    empty: 'No data yet',
    noResults: 'No results',
    forbidden: 'Access denied',
    unauthenticated: 'Session expired',
    failed: 'Unable to load list',
    refreshFailed: 'Refresh failed; showing previous data',
    retry: 'Retry',
    retrying: 'Retrying…',
    clear: 'Clear filters',
    signIn: 'Sign in',
  },

  ...fileUi,
  ...approvalUi,
  approval: approval.approval,
  srm,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
