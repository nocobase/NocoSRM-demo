import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { procurement } from '../../seed-data/srm-permission-sets.js';

export default defineSeed({
  name: '202611030001_srm_permission_sets',
  async run({ query }) {
    const existing = await query.selectFrom('authorizationPermissionSets').select('id').where('key', '=', procurement.key).executeTakeFirst();
    if (existing) return;
    const now = new Date();
    await query.insertInto('authorizationPermissionSets').values({ id: procurement.key, key: procurement.key, title: encodeAuthorizationTitle(procurement.title), grants: JSON.stringify(procurement.grants), createdAt: now, updatedAt: now }).execute();
  },
});
