import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Application } from '@nocobase/app-server/application';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { TestApp } from '@nocobase/app-testing/server';
import { createStandaloneServer } from '../../server/standalone.js';
import { profileSchema } from '../../server/srm/schema.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      rateLimit: { enabled: false },
      secret: 'srm-http-test-authentication-secret-32',
      emailAndPassword: { requireEmailVerification: false },
    },
  },
});

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
const emptyProfile = profileSchema.parse({});
const validCode = '91350211M000100Y44';

async function createSupplier(app: Application, testApp: TestApp) {
  const email = `${randomUUID()}@example.test`;
  const password = 'Srm-test-123!';
  const user = await app.container
    .resolve(userAdministrationServiceToken)
    .create({ name: 'HTTP supplier', email, password });
  await app.container.resolve(authorizationToken).permissionSets.assign({
    subject: { type: 'user', id: user.id },
    permissionSet: 'srm-supplier',
  });
  return signIn(testApp, { email, password });
}

async function upload(session: TestSession, file: File) {
  const form = new FormData();
  form.set('file', file);
  return session.fetch('/srm/files', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: form,
  });
}

function pdfFile(size: number, name = 'license.pdf') {
  const bytes = new Uint8Array(size);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  return new File([bytes], name, { type: 'application/pdf' });
}

test('validates registration and supplier draft input over HTTP', async ({
  app,
  testApp,
}) => {
  const registration = await testApp.request(
    '/auth/sign-up/email',
    json({
      email: `${randomUUID()}@example.test`,
      name: 'Trimmed referrer',
      password: 'Srm-test-123!',
      referrerName: '  Referral Person  ',
    }),
  );
  expect(registration.status).toBe(200);
  const { user: registered } = await registration.json();
  expect(registered.referrerName).toBe('Referral Person');

  const supplier = await signIn(testApp, {
    email: registered.email,
    password: 'Srm-test-123!',
  });
  const unicodeProfile = {
    ...emptyProfile,
    legalName: '  中文供应商😀  ',
    creditCode: validCode.toLowerCase(),
    address: '  北京市  ',
    products: '  机器零件😀  ',
    contactName: '  李😀  ',
    phone: '  +86 138-0013-8000  ',
    contactEmail: '  contact@example.test  ',
    referrerName: '  陈😀  ',
  };
  const saved = await supplier.fetch(
    '/srm/profile',
    json({ profile: unicodeProfile, expectedVersion: 0 }),
  );
  expect(saved.status).toBe(200);
  const savedData = (await saved.json()).data;
  expect(savedData.draft).toMatchObject({
    legalName: '中文供应商😀',
    creditCode: validCode,
    address: '北京市',
    products: '机器零件😀',
    contactName: '李😀',
    phone: '+86 138-0013-8000',
    contactEmail: 'contact@example.test',
    referrerName: '陈😀',
  });
  const reread = await supplier.fetch('/srm/profile');
  expect((await reread.json()).data.company.draft).toEqual(savedData.draft);

  const longReferrer = await createSupplier(app, testApp);
  const tooLong = await longReferrer.fetch(
    '/srm/profile',
    json({
      profile: { ...emptyProfile, referrerName: 'R'.repeat(101) },
      expectedVersion: 0,
    }),
  );
  expect(tooLong.status).toBe(400);
  const longReferrerError = (await tooLong.json()).error;
  expect(longReferrerError.fieldViolations).toContainEqual(
    expect.objectContaining({ field: 'profile.referrerName' }),
  );

  const invalidProfileSupplier = await createSupplier(app, testApp);
  for (const [field, value] of [
    ['creditCode', '91350211M000100Y4!'],
    ['phone', 'call me maybe'],
    ['contactEmail', 'not-an-email'],
  ] as const) {
    const response = await invalidProfileSupplier.fetch(
      '/srm/profile',
      json({
        profile: { ...emptyProfile, [field]: value },
        expectedVersion: 0,
      }),
    );
    expect(response.status).toBe(400);
    const error = (await response.json()).error;
    expect(error.fieldViolations).toContainEqual(
      expect.objectContaining({ field: `profile.${field}` }),
    );
  }
});

test('protects concurrent drafts, locked credit codes and owner-only files', async ({
  app,
  testApp,
}) => {
  const supplier = await createSupplier(app, testApp);
  const initial = await supplier.fetch(
    '/srm/profile',
    json({ profile: emptyProfile, expectedVersion: 0 }),
  );
  expect(initial.status).toBe(200);
  const version = (await initial.json()).data.lifecycleVersion;
  const updates = await Promise.all(
    ['Concurrent winner A', 'Concurrent winner B'].map((legalName) =>
      supplier.fetch(
        '/srm/profile',
        json(
          {
            profile: { ...emptyProfile, legalName },
            expectedVersion: version,
          },
          key(),
        ),
      ),
    ),
  );
  expect(updates.map((response) => response.status).sort()).toEqual([200, 409]);
  const rejected = updates.find((response) => response.status === 409)!;
  expect((await rejected.json()).error.reason).toBe('STATE_CHANGED');
  const finalDraft = (await (await supplier.fetch('/srm/profile')).json()).data
    .company.draft;
  expect(['Concurrent winner A', 'Concurrent winner B']).toContain(
    finalDraft.legalName,
  );

  const registered = await createSupplier(app, testApp);
  const lockedCode = '91350211M000100Y42';
  const codeDraft = await registered.fetch(
    '/srm/profile',
    json({
      profile: { ...emptyProfile, creditCode: lockedCode },
      expectedVersion: 0,
    }),
  );
  expect(codeDraft.status).toBe(200);
  const company = (await codeDraft.json()).data;
  const changedCode = await registered.fetch(
    '/srm/profile',
    json({
      profile: { ...emptyProfile, creditCode: '91350211M000100Y43' },
      expectedVersion: company.lifecycleVersion,
    }),
  );
  expect((await changedCode.json()).error.reason).toBe('CREDIT_CODE_LOCKED');

  const duplicate = await createSupplier(app, testApp);
  const duplicateCode = await duplicate.fetch(
    '/srm/profile',
    json({
      profile: { ...emptyProfile, creditCode: lockedCode.toLowerCase() },
      expectedVersion: 0,
    }),
  );
  expect(duplicateCode.status).toBe(409);
  const duplicateBody = await duplicateCode.json();
  expect(duplicateBody.error.reason).toBe('COMPANY_ALREADY_REGISTERED');
  expect(JSON.stringify(duplicateBody)).not.toContain(registered.user.email);
  expect(JSON.stringify(duplicateBody)).not.toContain(registered.user.id);
  expect(JSON.stringify(duplicateBody)).not.toContain(registered.user.name);

  const fileOwner = await createSupplier(app, testApp);
  const foreign = await upload(
    fileOwner,
    new File(['%PDF-1.7\nowner file'], 'owner.pdf', {
      type: 'application/pdf',
    }),
  );
  expect(foreign.status).toBe(200);
  const foreignFile = (await foreign.json()).data;
  const otherSupplier = await createSupplier(app, testApp);
  const foreignAttachment = await otherSupplier.fetch(
    '/srm/profile',
    json({
      profile: {
        ...emptyProfile,
        attachments: [{ id: foreignFile.id, kind: 'license', name: 'License' }],
      },
      expectedVersion: 0,
    }),
  );
  expect(foreignAttachment.status).toBe(400);
  expect((await foreignAttachment.json()).error.reason).toBe(
    'INVALID_ATTACHMENTS',
  );
});

test('checks upload signatures and the 10 MB boundary', async ({
  app,
  testApp,
}) => {
  const supplier = await createSupplier(app, testApp);
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const renamedPng = await upload(
    supplier,
    new File([pngBytes], 'renamed.pdf', { type: 'application/pdf' }),
  );
  expect(renamedPng.status).toBe(400);
  expect((await renamedPng.json()).error.reason).toBe('INVALID_FILE_TYPE');

  const executable = await upload(
    supplier,
    new File(['MZ executable'], 'installer.exe', {
      type: 'application/x-msdownload',
    }),
  );
  expect(executable.status).toBe(400);
  expect((await executable.json()).error.reason).toBe('INVALID_FILE_TYPE');

  const empty = await upload(
    supplier,
    new File([], 'empty.pdf', { type: 'application/pdf' }),
  );
  expect(empty.status).toBe(400);
  expect((await empty.json()).error.reason).toBe('INVALID_FILE');

  const tooLarge = await upload(supplier, pdfFile(10 * 1024 * 1024 + 1));
  expect(tooLarge.status).toBe(400);
  expect((await tooLarge.json()).error.reason).toBe('INVALID_FILE');

  const maxSize = 10 * 1024 * 1024;
  const accepted = await upload(supplier, pdfFile(maxSize));
  expect(accepted.status).toBe(200);
  expect((await accepted.json()).data.size).toBe(maxSize);
});

test('enforces submission prerequisites, internal permissions and logout', async ({
  app,
  testApp,
}) => {
  const supplier = await createSupplier(app, testApp);
  const missingDeclaration = await supplier.fetch(
    '/srm/submit',
    json({ expectedVersion: 0 }),
  );
  expect(missingDeclaration.status).toBe(400);

  const license = await upload(
    supplier,
    new File(['%PDF-1.7\nbusiness license'], 'business-license.pdf', {
      type: 'application/pdf',
    }),
  );
  expect(license.status).toBe(200);
  const licenseId = (await license.json()).data.id;
  const draft = await supplier.fetch(
    '/srm/profile',
    json({
      profile: {
        ...emptyProfile,
        legalName: 'Incomplete company',
        creditCode: '91350211M000100Y43',
        address: 'Beijing',
        products: 'Parts',
        contactName: 'Alice',
        phone: '13800138000',
        contactEmail: 'contact@example.test',
        attachments: [{ id: licenseId, kind: 'license', name: 'License' }],
      },
      expectedVersion: 0,
    }),
  );
  expect(draft.status).toBe(200);
  const lifecycleVersion = (await draft.json()).data.lifecycleVersion;
  const incomplete = await supplier.fetch(
    '/srm/submit',
    json({ expectedVersion: lifecycleVersion, declaration: true }),
  );
  expect(incomplete.status).toBe(400);
  const incompleteError = (await incomplete.json()).error;
  expect(incompleteError.reason).toBe('PROFILE_INCOMPLETE');
  expect(incompleteError.fieldViolations).toContainEqual(
    expect.objectContaining({ field: 'categories' }),
  );
  const afterRejectedSubmit = (
    await (await supplier.fetch('/srm/profile')).json()
  ).data;
  expect(afterRejectedSubmit.company.status).toBe('draft');
  expect(afterRejectedSubmit.versions).toHaveLength(0);

  expect((await supplier.fetch('/srm/applications')).status).toBe(403);
  expect((await supplier.fetch('/srm/suppliers')).status).toBe(403);
  expect((await supplier.fetch('/srm/workflow')).status).toBe(403);
  expect(
    (
      await supplier.fetch(
        '/srm/categories',
        json({ name: 'Forbidden', nameEn: 'Forbidden', active: true }),
      )
    ).status,
  ).toBe(403);
  expect(
    (await supplier.fetch('/srm/effects/not-a-run/retry', json({}))).status,
  ).toBe(403);
  expect(
    (
      await supplier.fetch(
        '/srm/notificationRetry',
        json({
          notificationId: 'unknown',
          deliveryId: 'unknown',
          reason: 'retry',
        }),
      )
    ).status,
  ).toBe(403);

  const logout = await supplier.fetch('/auth/sign-out', json({}));
  expect(logout.status).toBe(200);
  expect((await supplier.fetch('/srm/context')).status).toBe(401);
});
