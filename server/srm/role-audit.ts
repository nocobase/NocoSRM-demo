import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';

/** Observe only successful native user-role writes; native authentication, authorization and receipts remain authoritative. */
export const roleAudit = defineHttpMiddleware<Application>({
  name: 'srm/role-assignment-audit',
  register(router, app) {
    const track = async (
      context: import('hono').Context,
      next: import('hono').Next,
    ) => {
      const write = ['POST', 'PATCH', 'PUT'].includes(context.req.method);
      if (!write) return next();
      const sets = app.container.resolve(authorizationToken).permissionSets;
      const targetId = context.req.param('id');
      const before = targetId
        ? (await sets.listAssignments()).filter(
            (entry) =>
              entry.subject.type === 'user' && entry.subject.id === targetId,
          )
        : [];
      await next();
      if (
        context.res.status >= 300 ||
        context.res.headers.get('Idempotency-Replayed') === 'true'
      )
        return;
      const actor = await app.container
        .resolve(authenticationToken)
        .getSession(context.req.raw.headers, {
          disableRefresh: true,
          disableCookieCache: true,
        });
      if (!actor || actor.credential) return;
      let id = targetId;
      if (!id) {
        const response = z
          .object({ data: z.object({ id: z.string() }) })
          .safeParse(await context.res.clone().json());
        if (!response.success) return;
        id = response.data.data.id;
      }
      const after = (await sets.listAssignments()).filter(
        (entry) => entry.subject.type === 'user' && entry.subject.id === id,
      );
      const oldKeys = new Set(before.map((entry) => entry.permissionSet));
      const newKeys = new Set(after.map((entry) => entry.permissionSet));
      const changes = [
        ...[...newKeys]
          .filter((key) => !oldKeys.has(key))
          .map((key) => ({ action: 'roleGranted', permissionSet: key })),
        ...[...oldKeys]
          .filter((key) => !newKeys.has(key))
          .map((key) => ({ action: 'roleRevoked', permissionSet: key })),
      ];
      try {
        const db = app.container.resolve(databaseManagerToken);
        await db.transaction(async (connection) => {
          for (const change of changes)
            await connection.repository('srmAudit').createOne({
              values: {
                id: randomUUID(),
                actorId: actor.user.id,
                companyId: `user:${id}`,
                action: change.action,
                details: {
                  permissionSet: change.permissionSet,
                  result: 'success',
                },
                at: new Date().toISOString(),
              },
            });
        });
      } catch (error) {
        app.container
          .resolve(loggingToken)
          .getLogger('srm')
          .error(
            { error, targetId: id },
            'Role assignment audit persistence failed.',
          );
      }
    };
    router.use('/api/users', track);
    router.use('/api/users/:id', track);
    router.use('/api/users/:id/roleScopes/:scope', track);
  },
});
