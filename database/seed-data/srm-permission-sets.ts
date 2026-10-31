import { definePermissionSet } from '@nocobase/authorization/permission-sets';

export const procurement = definePermissionSet('srm-procurement')
  .title({ key: 'srm.procurement', ns: 'nocosrm-demo' })
  .grant(
    {
      resource: { type: 'settings', id: 'srm.business' },
      actions: ['readApplications', 'approve', 'reject', 'readSuppliers'].map(
        (action) => ({ action }),
      ),
    },
    {
      resource: { type: 'page', id: 'srmApplications' },
      actions: [{ action: 'access' }],
    },
    {
      resource: { type: 'page', id: 'srmSuppliers' },
      actions: [{ action: 'access' }],
    },
  )
  .build();

export const supplier = definePermissionSet('srm-supplier')
  .title({ key: 'srm.supplierRole', ns: 'nocosrm-demo' })
  .grant(
    {
      resource: { type: 'settings', id: 'srm.business' },
      actions: [{ action: 'applyAdmission' }],
    },
    {
      resource: { type: 'page', id: 'srmAdmission' },
      actions: [{ action: 'access' }],
    },
  )
  .build();
