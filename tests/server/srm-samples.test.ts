import { expect, vi } from 'vitest';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import { srmServiceToken } from '../../server/providers/srm.js';
import { loadSrmSamples } from '../../server/srm/sample.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'srm-sample-test-secret-at-least-32-characters' },
  },
});
test('loads reusable samples through real account, file and approval services', async ({
  app,
  testApp,
}) => {
  const service = app.container.resolve(srmServiceToken);
  const notifications = app.container.resolve(notificationServiceToken);
  const send = notifications.send.bind(notifications);
  let failureInjected = false;
  const sending = vi
    .spyOn(notifications, 'send')
    .mockImplementation(async (input) => {
      if (!failureInjected) {
        failureInjected = true;
        throw new Error('Synthetic notification failure');
      }
      return send(input);
    });
  await loadSrmSamples(service);
  const records = await service.db.repository('srmCompanies').findMany();
  expect(records.map((row) => row.status).sort()).toEqual([
    'approved',
    'draft',
    'pending',
    'rejected',
  ]);
  await vi.waitFor(
    async () => {
      const effects = await service.runtime.listEffectRuns({
        lifecycle: 'srmCompanies',
      });
      expect(effects.every((effect) => effect.status === 'succeeded')).toBe(
        true,
      );
      expect(effects.some((effect) => effect.attempts > 1)).toBe(true);
    },
    { timeout: 15_000 },
  );
  sending.mockRestore();
  const before = await service.db.repository('srmVersions').count();
  await loadSrmSamples(service);
  expect(await service.db.repository('srmCompanies').count()).toBe(4);
  expect(await service.db.repository('srmVersions').count()).toBe(before);
  const manager = await signIn(testApp, {
    email: 'manager@srm.test',
    password: '12345678',
  });
  expect((await manager.fetch('/srm/applications')).status).toBe(200);
  const approved = await signIn(testApp, {
    email: 'approved@srm.test',
    password: '12345678',
  });
  const detail = await (await approved.fetch('/srm/profile')).json();
  expect(detail.data.company.status).toBe('approved');
  const file = detail.data.company.snapshot.attachments[0];
  expect((await approved.fetch(`/srm/files/${file.id}`)).status).toBe(200);
});
