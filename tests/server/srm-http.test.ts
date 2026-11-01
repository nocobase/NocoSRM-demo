import { expect, it } from 'vitest';
import { createTestApp } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';
import { randomUUID } from 'node:crypto';
import { profileSchema } from '../../server/srm/schema.js';
const emptyProfile = profileSchema.parse({});

const key = () => `${Date.now()}.${randomUUID()}`;
const json = (body: unknown, operationKey = key()) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': operationKey,
  },
  body: JSON.stringify(body),
});
it('registers without email integration, protects files and idempotently submits over HTTP', async () => {
  const testApp = await createTestApp({
    createServer: createStandaloneServer,
    connections: ['main'],
    config: {
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: 'srm-test-authentication-secret-32-characters' },
      logging: { enabled: false },
    },
  });
  try {
    const registration = await testApp.request(
      '/auth/sign-up/email',
      json({
        email: 'smtp-supplier@example.test',
        name: 'SMTP supplier',
        password: 'Srm-test-123!',
        referrerName: '  Introducer  ',
      }),
    );
    expect(registration.status).toBe(200);
    const supplier = await signIn(testApp, {
      email: 'smtp-supplier@example.test',
      password: 'Srm-test-123!',
    });
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const sets =
      testApp.application.container.resolve(authorizationToken).permissionSets;
    await sets.assign({
      permissionSet: 'srm-procurement',
      subject: { type: 'user', id: admin.user.id },
    });
    const apiDocumentResponse = await admin.fetch('/swagger');
    expect(apiDocumentResponse.status).toBe(200);
    const apiDocument = await apiDocumentResponse.json();
    expect(apiDocument.paths['/api/srm/profile'].post.operationId).toBe(
      'srmSaveProfile',
    );
    expect(apiDocument.paths['/api/srm/files/{id}'].get.operationId).toBe(
      'srmDownloadFile',
    );
    const categoryResponse = await admin.fetch(
      '/srm/categories',
      json({
        name: '办公用品',
        nameEn: 'Office supplies',
        active: true,
        revision: 0,
      }),
    );
    expect(categoryResponse.status).toBe(200);
    const category = (await categoryResponse.json()).data;
    const upload = async (file: File) => {
      const form = new FormData();
      form.set('file', file);
      return supplier.fetch('/srm/files', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
        body: form,
      });
    };
    expect(
      (
        await upload(
          new File(['hello'], 'fake.pdf', { type: 'application/pdf' }),
        )
      ).status,
    ).toBe(400);
    const uploadResponse = await upload(
      new File(['%PDF-1.7\nSynthetic qualification'], 'license.pdf', {
        type: 'application/pdf',
      }),
    );
    expect(uploadResponse.status).toBe(200);
    const file = (await uploadResponse.json()).data;
    expect((await testApp.request(`/srm/files/${file.id}`)).status).toBe(401);
    expect((await admin.fetch(`/srm/files/${file.id}`)).status).toBe(403);
    expect((await supplier.fetch(`/srm/files/${file.id}`)).status).toBe(200);
    const profile = {
      ...emptyProfile,
      legalName: '测试办公用品有限公司',
      creditCode: '91350211M000100Y44',
      address: 'Beijing 20',
      products: 'Office supplies',
      contactName: 'Alice',
      phone: '13800138000',
      contactEmail: 'contact@example.test',
      categories: [category.id],
      attachments: [{ id: file.id, kind: 'license', name: 'License' }],
      referrerName: 'Introducer',
    };
    const saveKey = key();
    const payload = { profile, expectedVersion: 0 };
    const saved = await supplier.fetch('/srm/profile', json(payload, saveKey));
    expect(saved.status).toBe(200);
    const company = (await saved.json()).data;
    const replay = await supplier.fetch('/srm/profile', json(payload, saveKey));
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.id).toBe(company.id);
    const submitKey = key();
    const submitPayload = {
      expectedVersion: company.lifecycleVersion,
      declaration: true,
    };
    const submitted = await supplier.fetch(
      '/srm/submit',
      json(submitPayload, submitKey),
    );
    expect(submitted.status).toBe(200);
    expect(
      (await supplier.fetch('/srm/submit', json(submitPayload, submitKey)))
        .status,
    ).toBe(200);
    expect((await admin.fetch(`/srm/files/${file.id}`)).status).toBe(200);
    const lockedSave = await supplier.fetch(
      '/srm/profile',
      json({ profile, expectedVersion: company.lifecycleVersion }),
    );
    expect(lockedSave.status).toBe(400);
    const detail = await (
      await admin.fetch(`/srm/companies/${company.id}`)
    ).json();
    expect(detail.data.versions).toHaveLength(1);
    expect(detail.data.company.draft.referrerName).toBe('Introducer');
  } finally {
    await testApp.close();
  }
}, 30_000);
