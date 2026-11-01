import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { supplier } from '../../seed-data/srm-permission-sets.js';

export default defineSeed({
  name: '202611040001_srm_supplier_access',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    const existing = await query.selectFrom('authorizationPermissionSets').select('id').where('key', '=', supplier.key).executeTakeFirst();
    if (!existing) await query.insertInto('authorizationPermissionSets').values({ id: supplier.key, key: supplier.key, title: encodeAuthorizationTitle(supplier.title), grants: JSON.stringify(supplier.grants), createdAt: now, updatedAt: now }).execute();
    // Preserve existing applicants without granting supplier access to unrelated accounts.
    const companies = await query.selectFrom('srmCompanies').select('ownerId').execute();
    for (const company of companies) {
      const assigned = await query.selectFrom('authorizationPermissionSetAssignments').select('permissionSetKey').where('subjectType', '=', 'user').where('subjectId', '=', company.ownerId).where('permissionSetKey', '=', supplier.key).executeTakeFirst();
      if (!assigned) await query.insertInto('authorizationPermissionSetAssignments').values({ id: `srm-supplier:${String(company.ownerId)}`, permissionSetKey: supplier.key, subjectType: 'user', subjectId: company.ownerId, createdAt: now, updatedAt: now }).execute();
    }
  },
});
