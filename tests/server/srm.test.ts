import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { createStandaloneServer } from '../../server/standalone.js';
import { srmServiceToken } from '../../server/providers/srm.js';
import { profileSchema } from '../../server/srm/schema.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      rateLimit: { enabled: false },
      secret: 'test-auth-secret-at-least-32-characters',
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

test('protects admission endpoints and initializes real approval services', async ({
  app,
  testApp,
  request,
}) => {
  expect((await request('/srm/context')).status).toBe(401);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/srm/context');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.permissions.approve).toBe(false);
  expect((await admin.fetch('/srm/categories')).status).toBe(200);
  const service = app.container.resolve(srmServiceToken);
  expect(service.approvals).toBeDefined();
});

test('saves incomplete drafts, hides them from reviewers, and rejects cross-company reads', async ({
  app,
  testApp,
}) => {
  const users = app.container.resolve(userAdministrationServiceToken);
  const supplier = await users.create({
    name: 'Supplier A',
    email: 'srm-a@example.test',
    password: 'Srm-test-123!',
  });
  await app.container.resolve(authorizationToken).permissionSets.assign({
    subject: { type: 'user', id: supplier.id },
    permissionSet: 'srm-supplier',
  });
  const other = await users.create({
    name: 'Supplier B',
    email: 'srm-b@example.test',
    password: 'Srm-test-123!',
  });
  const service = app.container.resolve(srmServiceToken);
  const company = await service.db.transaction((tx) =>
    service.save(
      supplier.id,
      profileSchema.parse({
        legalName: 'Draft company',
        referrerName: '  Alice  ',
      }),
      0,
      key(),
      tx,
    ),
  );
  expect(company.draft.referrerName).toBe('Alice');
  const user = await signIn(testApp, {
    email: other.email,
    password: 'Srm-test-123!',
  });
  expect((await user.fetch(`/srm/companies/${company.id}`)).status).toBe(403);
  expect((await user.fetch('/srm/applications')).status).toBe(403);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect((await admin.fetch(`/srm/companies/${company.id}`)).status).toBe(403);
  const sets = app.container.resolve(authorizationToken).permissionSets;
  await sets.assign({
    subject: { type: 'user', id: other.id },
    permissionSet: 'srm-procurement',
  });
  const listed = await (await user.fetch('/srm/applications')).json();
  expect(listed.data).toEqual([]);
  const incomplete = await user.fetch(
    '/srm/submit',
    json({ expectedVersion: 0, declaration: true }),
  );
  expect(incomplete.status).toBe(403);
});

test('native approval pool rejects, preserves snapshots, resubmits and admits exactly once', async ({
  app,
  testApp,
}) => {
  const service = app.container.resolve(srmServiceToken);
  const users = app.container.resolve(userAdministrationServiceToken);
  const sets = app.container.resolve(authorizationToken).permissionSets;
  const supplier = await users.create({
    name: 'Supplier Full',
    email: 'full@example.test',
    password: 'Srm-test-123!',
  });
  await sets.assign({
    subject: { type: 'user', id: supplier.id },
    permissionSet: 'srm-supplier',
  });
  await sets.assign({
    subject: { type: 'user', id: supplier.id },
    permissionSet: 'srm-procurement',
  });
  const manager = await users.create({
    name: 'Manager One',
    email: 'manager@example.test',
    password: 'Srm-test-123!',
  });
  const secondManager = await users.create({
    name: 'Manager Two',
    email: 'manager2@example.test',
    password: 'Srm-test-123!',
  });
  await sets.assign({
    permissionSet: 'srm-procurement',
    subject: { type: 'user', id: manager.id },
  });
  await sets.assign({
    permissionSet: 'srm-procurement',
    subject: { type: 'user', id: secondManager.id },
  });
  const categoryId = randomUUID();
  await service.db.repository('srmCategories').createOne({
    values: {
      id: categoryId,
      name: '机械',
      nameEn: 'Machinery',
      active: true,
      revision: 0,
    },
  });
  const fileId = randomUUID();
  // The File plugin's real upload/storage path is verified in the SMTP/HTTP suite below; this test isolates approval transactions.
  await service.db.repository('srmFiles').createOne({
    values: {
      id: fileId,
      ownerId: supplier.id,
      disk: 'local',
      key: 'synthetic.pdf',
      filename: 'synthetic.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      size: 12,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const profile = profileSchema.parse({
    legalName: '测试机械有限公司',
    creditCode: '91350211M000100Y43',
    address: 'Shanghai 10',
    products: 'Industrial machinery',
    contactName: 'Alice',
    phone: '13800138000',
    contactEmail: 'contact@example.test',
    categories: [categoryId],
    attachments: [{ id: fileId, kind: 'license', name: 'Business license' }],
    referrerName: 'Original introducer',
  });
  let company = await service.db.transaction((tx) =>
    service.save(supplier.id, profile, 0, key(), tx),
  );
  company = await service.db.transaction((tx) =>
    service.submit(supplier.id, company.lifecycleVersion, key(), tx),
  );
  expect(company.status).toBe('pending');
  const first = await service.detail(manager.id, company.id);
  expect(first.versions).toHaveLength(1);
  expect(first.people[supplier.id]).toBe('Supplier Full');
  expect(first.people[manager.id]).toBe('Manager One');
  expect(first.actions[0]?.actions.map((a) => a.name)).toContain('approve');
  const reviewer = await signIn(testApp, {
    email: manager.email,
    password: 'Srm-test-123!',
  });
  const second = await signIn(testApp, {
    email: secondManager.email,
    password: 'Srm-test-123!',
  });
  const offered = first.actions[0]!;
  expect(
    await service.approvals.actionsFor('srmCompanies', company.id, {
      id: supplier.id,
    }),
  ).toEqual([]);
  const applicantSession = await signIn(testApp, {
    email: supplier.email,
    password: 'Srm-test-123!',
  });
  expect(
    (
      await applicantSession.fetch(
        `/srm/companies/${company.id}/decision`,
        json({
          taskId: offered.task.id,
          action: 'approve',
          contentHash: offered.contentHash,
          comment: '',
        }),
      )
    ).status,
  ).toBe(403);

  expect(
    (
      await reviewer.fetch(
        `/srm/companies/${company.id}/decision`,
        json({
          taskId: offered.task.id,
          action: 'reject',
          contentHash: offered.contentHash,
          comment: ' ',
        }),
      )
    ).status,
  ).toBe(400);
  const rejection = await reviewer.fetch(
    `/srm/companies/${company.id}/decision`,
    json({
      taskId: offered.task.id,
      action: 'reject',
      contentHash: offered.contentHash,
      comment: 'Please update your introduction.',
    }),
  );
  expect(rejection.status).toBe(200);
  company = await service.company(company.id);
  expect(company.status).toBe('rejected');
  company = await service.db.transaction((tx) =>
    service.save(
      supplier.id,
      { ...profile, referrerName: 'Updated introducer' },
      company.lifecycleVersion,
      key(),
      tx,
    ),
  );
  const hiddenChanges = await service.detail(manager.id, company.id);
  expect(hiddenChanges.company.draft?.referrerName).toBe('Original introducer');
  company = await service.db.transaction((tx) =>
    service.submit(supplier.id, company.lifecycleVersion, key(), tx),
  );
  const resubmitted = await service.detail(manager.id, company.id);
  expect(resubmitted.runs).toHaveLength(2);
  expect(resubmitted.versions).toHaveLength(2);
  expect(
    resubmitted.versions.find((v) => v.version === 1)?.snapshot.referrerName,
  ).toBe('Original introducer');
  const a = resubmitted.actions[0]!;
  const b = (await service.detail(secondManager.id, company.id)).actions[0]!;
  const decisions = await Promise.all([
    reviewer.fetch(
      `/srm/companies/${company.id}/decision`,
      json({
        taskId: a.task.id,
        action: 'approve',
        contentHash: a.contentHash,
        comment: '',
      }),
    ),
    second.fetch(
      `/srm/companies/${company.id}/decision`,
      json({
        taskId: b.task.id,
        action: 'approve',
        contentHash: b.contentHash,
        comment: '',
      }),
    ),
  ]);
  expect(decisions.map((r) => r.status).filter((s) => s === 200)).toHaveLength(
    1,
  );
  company = await service.company(company.id);
  expect(company.status).toBe('approved');
  expect(company.supplierNo).toMatch(/^SUP[A-Z0-9]+$/);
  expect(company.snapshot?.referrerName).toBe('Updated introducer');
  expect(
    await service.db
      .repository('srmAudit')
      .count({ filter: { companyId: company.id, action: 'approved' } }),
  ).toBe(1);
  await expect(
    service.db.transaction((tx) =>
      service.save(supplier.id, profile, company.lifecycleVersion, key(), tx),
    ),
  ).rejects.toThrow('PROFILE_LOCKED');
  const assignment = (await sets.listAssignments('srm-procurement')).find(
    (entry) => entry.subject.id === manager.id,
  )!;
  await sets.revoke(assignment.id);
  expect(await service.can(manager.id, 'approve')).toBe(false);
});

test('rolls back task allocation and submission snapshots when a business write fails', async ({
  app,
}) => {
  const service = app.container.resolve(srmServiceToken);
  const users = app.container.resolve(userAdministrationServiceToken);
  const owner = await users.create({
    name: 'Rollback supplier',
    email: 'rollback@example.test',
    password: 'Srm-test-123!',
  });
  const manager = await users.create({
    name: 'Rollback manager',
    email: 'rollback-manager@example.test',
    password: 'Srm-test-123!',
  });
  await app.container.resolve(authorizationToken).permissionSets.assign({
    permissionSet: 'srm-procurement',
    subject: { type: 'user', id: manager.id },
  });
  await app.container.resolve(authorizationToken).permissionSets.assign({
    subject: { type: 'user', id: owner.id },
    permissionSet: 'srm-supplier',
  });
  const categoryId = randomUUID();
  await service.db.repository('srmCategories').createOne({
    values: {
      id: categoryId,
      name: 'Rollback category',
      nameEn: 'Rollback category',
      active: true,
      revision: 0,
    },
  });
  const fileId = randomUUID();
  await service.db.repository('srmFiles').createOne({
    values: {
      id: fileId,
      ownerId: owner.id,
      disk: 'local',
      key: 'rollback.pdf',
      filename: 'rollback.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      size: 12,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const profile = profileSchema.parse({
    legalName: 'Rollback supplier',
    creditCode: '91350211M000100Y48',
    address: 'Test road',
    products: 'Test services',
    contactName: 'Alice',
    phone: '13800138000',
    contactEmail: 'rollback@example.test',
    categories: [categoryId],
    attachments: [{ id: fileId, kind: 'license', name: 'License' }],
  });
  const company = await service.db.transaction((tx) =>
    service.save(owner.id, profile, 0, key(), tx),
  );
  const original = service.services.bind(service);
  const failure = vi
    .spyOn(service, 'services')
    .mockImplementation((connection) => ({
      ...original(connection),
      connection: new Proxy(connection, {
        get(target, property, receiver) {
          if (property === 'repository')
            return (collection: string) =>
              collection === 'srmVersions'
                ? {
                    createOne: () =>
                      Promise.reject(new Error('Synthetic snapshot failure')),
                  }
                : target.repository(collection);
          const value: unknown = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    }));
  await expect(
    service.db.transaction((tx) =>
      service.submit(owner.id, company.lifecycleVersion, key(), tx),
    ),
  ).rejects.toThrow('Synthetic snapshot failure');
  failure.mockRestore();
  expect((await service.company(company.id)).status).toBe('draft');
  expect(
    await service.db
      .repository('srmVersions')
      .count({ filter: { companyId: company.id } }),
  ).toBe(0);
  expect(
    await service.approvals.runViewsFor('srmCompanies', company.id),
  ).toEqual([]);
});

test('audits native role grants and removals with the real administrator identity', async ({
  app,
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const created = await admin.fetch(
    '/users',
    json({
      name: 'Audited manager',
      email: 'audited-manager@example.test',
      password: 'Srm-test-123!',
      roleScopes: { app: ['srm-procurement'] },
    }),
  );
  expect(created.status).toBe(201);
  const user = (await created.json()).data;
  const service = app.container.resolve(srmServiceToken);
  const granted = await service.db.repository('srmAudit').findMany({
    filter: { companyId: `user:${user.id}`, action: 'roleGranted' },
  });
  expect(granted.some((event) => event.actorId === admin.user.id)).toBe(true);
  const removed = await admin.fetch(`/users/${user.id}`, {
    ...json({ roleScopes: { app: [] } }),
    method: 'PATCH',
  });
  expect(removed.status).toBe(200);
  const revoked = await service.db.repository('srmAudit').findMany({
    filter: { companyId: `user:${user.id}`, action: 'roleRevoked' },
  });
  expect(revoked.some((event) => event.actorId === admin.user.id)).toBe(true);
});

test('self-registration provisions only supplier access and revocation closes replay', async ({
  app,
  testApp,
  request,
}) => {
  const result = await request(
    '/auth/sign-up/email',
    json({
      email: 'public-supplier@example.test',
      name: 'Public supplier',
      username: 'publicsupplier',
      password: 'Srm-test-123!',
      role: 'root',
      permissionSet: 'srm-procurement',
    }),
  );
  expect(result.status).toBe(200);
  const { user: created } = await result.json();
  const sets = app.container.resolve(authorizationToken).permissionSets;
  const assignments = (await sets.listAssignments()).filter(
    (a) => a.subject.id === created.id,
  );
  expect(assignments.map((a) => a.permissionSet)).toContain('srm-supplier');
  expect(assignments.map((a) => a.permissionSet)).not.toContain(
    'srm-procurement',
  );
  expect(assignments.map((a) => a.permissionSet)).not.toContain('root');
  const supplier = await signIn(testApp, {
    email: created.email,
    password: 'Srm-test-123!',
  });
  expect((await supplier.fetch('/srm/profile')).status).toBe(200);
  expect((await supplier.fetch('/srm/applications')).status).toBe(403);
  const operationKey = key();
  const draft = {
    profile: profileSchema.parse({ legalName: 'Registered company' }),
    expectedVersion: 0,
  };
  expect(
    (await supplier.fetch('/srm/profile', json(draft, operationKey))).status,
  ).toBe(200);
  await sets.revoke(
    assignments.find((a) => a.permissionSet === 'srm-supplier')!.id,
  );
  expect(
    (await supplier.fetch('/srm/profile', json(draft, operationKey))).status,
  ).toBe(403);
  expect((await supplier.fetch('/srm/profile')).status).toBe(403);
  expect(
    (await (await supplier.fetch('/srm/context')).json()).data.company,
  ).toBeUndefined();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  for (const path of ['/srm/profile', '/srm/submit', '/srm/files']) {
    expect((await admin.fetch(path, json({}))).status).toBe(403);
    expect((await request(path, json({}))).status).toBe(401);
  }
  expect((await admin.fetch('/srm/profile')).status).toBe(403);
});

test('failed registration provisioning stays closed and can be recovered through role administration', async ({
  app,
  testApp,
  request,
}) => {
  const sets = app.container.resolve(authorizationToken).permissionSets;
  const assign = vi
    .spyOn(sets, 'assign')
    .mockRejectedValueOnce(new Error('Provisioning unavailable'));
  const response = await request(
    '/auth/sign-up/email',
    json({
      email: 'recover@example.test',
      name: 'Recovery supplier',
      username: 'recoverysupplier',
      password: 'Srm-test-123!',
    }),
  );
  assign.mockRestore();
  expect(response.status).toBe(503);
  const users = app.container.resolve(userAdministrationServiceToken);
  const user = (
    await users.list({ search: 'recover@example.test', page: 1, pageSize: 10 })
  ).items[0]!;
  const session = await signIn(testApp, {
    email: user.email,
    password: 'Srm-test-123!',
  });
  expect((await session.fetch('/srm/profile')).status).toBe(403);
  await sets.assign({
    subject: { type: 'user', id: user.id },
    permissionSet: 'srm-supplier',
  });
  expect((await session.fetch('/srm/profile')).status).toBe(200);
});
