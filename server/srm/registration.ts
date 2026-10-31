import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  defineHttpMiddleware,
} from '@nocobase/app-server/router';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';

/** Only a successful native public registration may provision an applicant. */
export const supplierRegistration = defineHttpMiddleware<Application>({
  name: 'srm/supplier-registration',
  register(router, app) {
    router.use('/api/auth/sign-up/email', async (c, next) => {
      await next();
      if (c.req.method !== 'POST' || c.res.status >= 300) return;
      const result = z
        .object({ user: z.object({ id: z.string() }) })
        .safeParse(await c.res.clone().json());
      if (!result.success) return;
      // The response ID is issued by Authentication; request role fields are never consulted.
      try {
        await app.container.resolve(authorizationToken).permissionSets.assign({
          subject: { type: 'user', id: result.data.user.id },
          permissionSet: 'srm-supplier',
        });
      } catch {
        c.res = apiErrorHandler(
          new ApiError({
            status: 'UNAVAILABLE',
            reason: 'SUPPLIER_PROVISIONING_FAILED',
            domain: 'srm',
            message:
              'Account created but supplier access could not be assigned. An administrator must assign the supplier applicant role in User management.',
          }),
          c as Parameters<typeof apiErrorHandler>[1],
        );
      }
    });
  },
});
