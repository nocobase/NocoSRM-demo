import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { srmServiceToken } from '../../server/providers/srm.js';
import { profileSchema } from '../../server/srm/schema.js';
import { decoded } from '../../server/srm/schema.js';
import { defaultAiSettings } from '../../server/srm/ai-schema.js';
import type { Application } from '@nocobase/app-server/application';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  scope: 'test',
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      rateLimit: { enabled: false },
      secret: 'isolated-test-secret-at-least-32-characters',
      emailAndPassword: { requireEmailVerification: false },
    },
  },
});
const key = () => `${Date.now()}.${randomUUID()}`;
const model = { modelService: 'test-model', model: 'deepseek-flash' };

async function prepare(app: Application, enabled = true) {
  const srm = app.container.resolve(
    srmServiceToken,
  ) as import('../../server/srm/service.js').SrmService;
  srm.effectDispatcher = { dispatch: async () => {} };
  const users = app.container.resolve(userAdministrationServiceToken);
  const sets = app.container.resolve(authorizationToken).permissionSets;
  const owner = await users.create({
    name: 'Synthetic supplier',
    email: 'ai-supplier@example.test',
    password: 'Synthetic-123!',
  });
  const manager = await users.create({
    name: 'Synthetic reviewer',
    email: 'ai-reviewer@example.test',
    password: 'Synthetic-123!',
  });
  await sets.assign({
    permissionSet: 'srm-supplier',
    subject: { type: 'user', id: owner.id },
  });
  await sets.assign({
    permissionSet: 'srm-procurement',
    subject: { type: 'user', id: manager.id },
  });
  const categoryId = randomUUID();
  const fileId = randomUUID();
  await srm.db.repository('srmCategories').createOne({
    values: {
      id: categoryId,
      name: 'Machinery',
      nameEn: 'Machinery',
      active: true,
      revision: 0,
    },
  });
  await srm.db.repository('srmFiles').createOne({
    values: {
      id: fileId,
      ownerId: owner.id,
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
    legalName: 'Synthetic machinery',
    creditCode: '91350211M000100Y43',
    address: 'Test road',
    introduction: 'Machinery supplier',
    products: 'Industrial machinery',
    contactName: 'Private person',
    phone: '13800138000',
    contactEmail: 'private@example.test',
    referrerName: 'Private referrer',
    categories: [categoryId],
    attachments: [{ id: fileId, kind: 'license', name: 'License.pdf' }],
  });
  const gateway = app.container.resolve(agentsToken).models
    .gateway as import('@nocobase/app-plugin-agents/server/tokens').ModelGateway;
  const generate = vi.spyOn(gateway, 'generate');
  await srm.db.repository('srmAiSettings').createOne({
    values: {
      id: 'admission',
      values: { enabled, threshold: 0.8, model, maxOutputTokens: 1024 },
      updatedBy: manager.id,
      updatedAt: new Date(),
    },
  });
  let company = await srm.db.transaction((tx) =>
    srm.save(owner.id, profile, 0, key(), tx),
  );
  company = await srm.db.transaction((tx) =>
    srm.submit(owner.id, company.lifecycleVersion, key(), tx),
  );
  const run = (
    await srm.runtime.listEffectRuns({
      recordId: company.id,
      effect: 'srm.aiReview',
    })
  )[0]!;
  const offered = (await srm.detail(manager.id, company.id)).actions[0]!;
  return { srm, owner, manager, company, run, offered, generate, profile };
}

for (const [recommendation, confidence, automatic] of [
  ['approve', 0.95, true],
  ['approve', 0.8, true],
  ['approve', 0.799, false],
  ['reject', 1, false],
  ['uncertain', 1, false],
] as const) {
  test(`${recommendation} at ${confidence} ${automatic ? 'approves the native task' : 'preserves human approval'}`, async ({
    app,
  }) => {
    const { srm, owner, manager, company, run, offered, generate } =
      await prepare(app);
    generate.mockResolvedValue({
      text: JSON.stringify({
        recommendation,
        confidence,
        reasons: ['Text is consistent.'],
      }),
    });
    await srm.runtime.runEffect(run.id);
    expect((await srm.company(company.id)).status).toBe(
      automatic ? 'approved' : 'pending',
    );
    const actions = await srm.approvals.actionsOf('srmCompanies', company.id);
    expect(actions).toHaveLength(automatic ? 1 : 0);
    if (automatic) {
      expect(actions[0]).toMatchObject({
        name: 'approve',
        actorId: 'srm.aiReview',
        role: 'system',
        onBehalfOf: null,
        taskId: offered.task.id,
      });
      expect(actions[0]!.input.automaticApproval).toMatchObject({
        confidence,
        threshold: 0.8,
      });
      expect((await srm.company(company.id)).supplierNo).toMatch(/^SUP/);
      const audit = await srm.db
        .repository('srmAudit')
        .findOne({ filter: { companyId: company.id, action: 'approved' } });
      expect(
        decoded<import('@nocobase/lifecycle').JsonObject>(audit!.details)
          .aiReview,
      ).toMatchObject({ confidence });
      await srm.approvals.approveAutomatically({
        taskId: offered.task.id,
        requestId: `ai:${run.id}:${offered.task.id}`,
        evidence: actions[0]!.input
          .automaticApproval as import('@nocobase/lifecycle').JsonObject,
      });
      expect(
        await srm.approvals.actionsOf('srmCompanies', company.id),
      ).toHaveLength(1);
      expect(
        await srm.db
          .repository('srmAudit')
          .count({ filter: { companyId: company.id, action: 'approved' } }),
      ).toBe(1);
    } else {
      await srm.approvals.approve({
        taskId: offered.task.id,
        actor: { id: manager.id },
        contentHash: offered.contentHash,
        requestId: key(),
      });
      expect((await srm.company(company.id)).status).toBe('approved');
    }
    const prompt = generate.mock.calls[0]![0].prompt;
    expect(prompt).not.toContain('Private person');
    expect(prompt).not.toContain('private@example.test');
    expect(prompt).not.toContain('13800138000');
    expect(prompt).not.toContain('Private referrer');
    expect(await srm.detail(owner.id, company.id)).not.toHaveProperty(
      'aiReviews',
    );
    expect(
      JSON.stringify((await srm.detail(owner.id, company.id)).runs),
    ).not.toContain('Text is consistent.');
    expect(
      (await srm.detail(manager.id, company.id)).aiReviews?.length,
    ).toBeGreaterThan(0);
  });
}

for (const response of [
  'not JSON',
  '{"recommendation":"approve","confidence":2,"reasons":["invalid"]}',
  'failure',
  'timeout',
]) {
  test(`falls back after ${response}`, async ({ app }) => {
    const { srm, manager, company, run, offered, generate } =
      await prepare(app);
    if (response === 'failure')
      generate.mockRejectedValue(new Error('synthetic provider failure'));
    else if (response === 'timeout')
      generate.mockImplementation(
        ({ signal }) =>
          new Promise((_, reject) =>
            signal!.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            ),
          ),
      );
    else generate.mockResolvedValue({ text: response });
    if (response === 'timeout') {
      vi.useFakeTimers();
      try {
        const execution = srm.runtime.runEffect(run.id);
        await vi.waitFor(() => expect(generate).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(30_001);
        await execution;
      } finally {
        vi.useRealTimers();
      }
    } else await srm.runtime.runEffect(run.id);
    expect((await srm.company(company.id)).status).toBe('pending');
    expect(
      await srm.approvals.actionsOf('srmCompanies', company.id),
    ).toHaveLength(0);
    await srm.approvals.approve({
      taskId: offered.task.id,
      actor: { id: manager.id },
      requestId: key(),
    });
    expect((await srm.company(company.id)).status).toBe('approved');
  });
}

test('disabled reviews never call a model and system perform remains forbidden', async ({
  app,
}) => {
  const { srm, company, run, offered, generate } = await prepare(app, false);
  await srm.runtime.runEffect(run.id);
  expect(generate).not.toHaveBeenCalled();
  expect((await srm.company(company.id)).status).toBe('pending');
  await expect(
    srm.approvals.perform({
      action: 'approve',
      target: { taskId: offered.task.id },
      actor: { id: 'srm.aiReview', system: true },
    }),
  ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  await expect(
    srm.approvals.approveAutomatically({
      taskId: offered.task.id,
      requestId: key(),
      evidence: {},
    }),
  ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
});

test('a human can finish while the model is running; the late response cannot decide twice', async ({
  app,
}) => {
  const { srm, manager, company, run, offered, generate } = await prepare(app);
  let release!: (result: { text: string }) => void;
  generate.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const execution = srm.runtime.runEffect(run.id);
  await vi.waitFor(() => expect(generate).toHaveBeenCalled());
  await srm.approvals.approve({
    taskId: offered.task.id,
    actor: { id: manager.id },
    requestId: key(),
  });
  release({
    text: JSON.stringify({
      recommendation: 'approve',
      confidence: 1,
      reasons: ['Consistent'],
    }),
  });
  await execution;
  expect((await srm.company(company.id)).status).toBe('approved');
  expect(
    await srm.approvals.actionsOf('srmCompanies', company.id),
  ).toHaveLength(1);
  expect(
    (await srm.approvals.actionsOf('srmCompanies', company.id))[0]!.actorId,
  ).toBe(manager.id);
});

test('an old response cannot approve a resubmitted application', async ({
  app,
}) => {
  const { srm, owner, manager, company, run, offered, generate, profile } =
    await prepare(app);
  let release!: (result: { text: string }) => void;
  generate
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({
      text: JSON.stringify({
        recommendation: 'approve',
        confidence: 1,
        reasons: ['Consistent'],
      }),
    });
  const original = srm.runtime.runEffect(run.id);
  await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  await srm.approvals.reject({
    taskId: offered.task.id,
    actor: { id: manager.id },
    comment: 'Please resubmit',
    requestId: key(),
  });
  let current = await srm.company(company.id);
  current = await srm.db.transaction((tx) =>
    srm.save(owner.id, profile, current.lifecycleVersion, key(), tx),
  );
  current = await srm.db.transaction((tx) =>
    srm.submit(owner.id, current.lifecycleVersion, key(), tx),
  );
  release({
    text: JSON.stringify({
      recommendation: 'approve',
      confidence: 1,
      reasons: ['Old response'],
    }),
  });
  await original;
  expect((await srm.company(company.id)).status).toBe('pending');
  const next = (
    await srm.runtime.listEffectRuns({
      recordId: company.id,
      effect: 'srm.aiReview',
    })
  ).find((effect) => effect.id !== run.id)!;
  await srm.runtime.runEffect(next.id);
  expect((await srm.company(company.id)).status).toBe('approved');
  expect(
    await srm.approvals.actionsOf('srmCompanies', company.id),
  ).toHaveLength(2);
  expect(generate).toHaveBeenCalledTimes(2);
});

test('settings require authorization, validate input, and replay writes', async ({
  app,
  testApp,
  request,
}) => {
  const { manager, run, srm, company } = await prepare(app, false);
  expect((await request('/srm/aiReview/settings')).status).toBe(401);
  const reviewer = await signIn(testApp, {
    email: manager.email,
    password: 'Synthetic-123!',
  });
  const init = {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'Idempotency-Key': key(),
    },
    body: JSON.stringify(defaultAiSettings),
  };
  expect((await reviewer.fetch('/srm/aiReview/settings', init)).status).toBe(
    403,
  );
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect((await admin.fetch('/srm/aiReview/settings')).status).toBe(200);
  expect(
    (
      await admin.fetch(`/srm/effects/${run.id}/retry`, {
        method: 'POST',
        headers: { origin: 'http://localhost' },
      })
    ).status,
  ).toBe(404);
  const unavailable = await admin.fetch('/srm/aiReview/settings', {
    ...init,
    headers: { ...init.headers, 'Idempotency-Key': key() },
    body: JSON.stringify({
      ...defaultAiSettings,
      enabled: true,
      threshold: 0.8,
      model,
    }),
  });
  expect(unavailable.status).toBe(400);
  await srm.db.repository('srmAudit').createOne({
    values: {
      id: randomUUID(),
      companyId: company.id,
      actorId: 'srm.aiReview',
      action: 'aiReview',
      at: new Date(),
      details: { reasons: ['Internal AI evidence'] },
    },
  });
  expect(
    JSON.stringify(await (await admin.fetch('/srm/workflow')).json()),
  ).not.toContain('Internal AI evidence');
  const first = await admin.fetch('/srm/aiReview/settings', init);
  expect(first.status).toBe(200);
  expect((await first.json()).data).toEqual(defaultAiSettings);
  expect((await admin.fetch('/srm/aiReview/settings', init)).status).toBe(200);
  const invalid = await admin.fetch('/srm/aiReview/settings', {
    ...init,
    headers: { ...init.headers, 'Idempotency-Key': key() },
    body: JSON.stringify({ ...defaultAiSettings, enabled: true }),
  });
  expect(invalid.status).toBe(400);
});
