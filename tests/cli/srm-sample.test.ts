import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createTestAppConfig } from '@nocobase/app-testing/server';
import { createDatabaseManager } from '@nocobase/db';
const exec = promisify(execFile);
it('loads CLI samples with started effect jobs and reusable notifications', async () => {
  const config = await createTestAppConfig({
    connections: ['main'],
    config: {
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: 'synthetic-cli-fixture-secret-at-least-32-characters' },
    },
  });
  try {
    const env = {
      ...process.env,
      APP_CONFIG_FILE: config.path,
      APP_STORAGE_DIR: path.join(config.directory, 'storage'),
    };
    const run = async (args: string[]) =>
      exec('pnpm', ['nocobase', 'db', ...args, '--json'], {
        cwd: process.cwd(),
        env,
        maxBuffer: 4 * 1024 * 1024,
      });
    await run(['apply']);
    const first = await run(['sample']);
    expect(JSON.parse(first.stdout).ok).toBe(true);
    expect(first.stderr).not.toContain('Admission effect jobs are not started');
    const again = await run(['sample']);
    expect(JSON.parse(again.stdout).ok).toBe(true);
    expect(again.stderr).not.toContain('could not be dispatched');
    // Read the committed CLI outcome before any server startup could recover queued work.
    const db = createDatabaseManager({
      default: 'main',
      connections: { main: config.testDatabases.connectionConfig('main') },
    });
    try {
      await db.connect();
      expect(await db.repository('srmCompanies').count()).toBe(4);
      const effects = await db
        .repository('srmEffectRuns')
        .findMany({ filter: { effect: 'srm.admissionNotice' } });
      expect(effects).toHaveLength(5);
      expect(effects.every((effect) => effect.status === 'succeeded')).toBe(
        true,
      );
      expect(
        effects.every((effect) =>
          JSON.stringify(effect.result).includes('notificationId'),
        ),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  } finally {
    await config.dispose();
  }
}, 30_000);
