import path from 'node:path';
import { createRequire } from 'node:module';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

describeMigration('202611040001_srm_ai_settings', {
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
    await expectCollection('srmAiSettings').toExist();
    await connection.repository('srmAiSettings').createOne({
      values: {
        id: 'admission',
        values: {
          enabled: false,
          threshold: null,
          model: null,
          maxOutputTokens: 1024,
        },
        updatedBy: 'synthetic-admin',
        updatedAt: new Date(),
      },
    });
    await expect(
      connection.repository('srmAiSettings').createOne({
        values: {
          id: 'admission',
          values: {},
          updatedBy: 'other',
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('srmAiSettings').not.toExist();
    await expectCollection('srmCompanies').toExist();
  },
});
