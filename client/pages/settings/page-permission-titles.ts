import type { PagePermissionTitles } from './page-permissions.js';

/** Permission labels for application pages without navigation/breadcrumb titles (including overlays).
 * Keys are existing route names; values are application translation keys.
 * Do not add navigation/breadcrumbs or change authorization ids just to name a permission.
 */
export const pagePermissionTitles: PagePermissionTitles = {
  srmApplicationDetail: 'srm.applicationDetail',
  srmSupplierDetail: 'srm.suppliers',
  srmCategoryCreate: 'srm.newCategory',
  srmCategoryEdit: 'srm.editCategory',
};
