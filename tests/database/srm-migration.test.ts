import path from 'node:path';
import { createRequire } from 'node:module';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

// All predecessors are supplied, so both a fresh installation and the explicit reverse are exercised.
describeMigration('202611030001_create_srm', {
  sources: [
    {
      packageName: '@nocobase/app-plugin-authentication',
      directory: path.resolve(
        path.dirname(
          createRequire(import.meta.url).resolve(
            '@nocobase/app-plugin-authentication/package.json',
          ),
        ),
        'dist/database/migrations',
      ),
    },
    {
      packageName: 'nocosrm-demo',
      directory: path.resolve('database/main/migrations'),
    },
  ],
  up: async ({ connection, expectCollection }) => {
    for (const name of [
      'srmCompanies',
      'srmVersions',
      'srmCategories',
      'srmFiles',
      'srmAudit',
      'srmTransitions',
      'srmEffectRuns',
    ])
      await expectCollection(name).toExist();
    await expectCollection('user').toHaveField('referrerName', {
      nullable: true,
    });
    const values = {
      id: 'b587cd2b-1456-49fc-9e07-181b46f9b101',
      ownerId: 'supplier-1',
      draft: {},
      submissionVersion: 0,
      lifecycleVersion: 1,
      status: 'draft',
      createdAt: new Date(),
      statusChangedAt: new Date(),
    };
    await connection.repository('srmCompanies').createOne({ values });
    await expect(
      connection.repository('srmCompanies').createOne({
        values: { ...values, id: 'b587cd2b-1456-49fc-9e07-181b46f9b102' },
      }),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    for (const name of [
      'srmCompanies',
      'srmVersions',
      'srmCategories',
      'srmFiles',
      'srmAudit',
      'srmTransitions',
      'srmEffectRuns',
    ])
      await expectCollection(name).not.toExist();
    await expectCollection('user').toExist();
  },
});
