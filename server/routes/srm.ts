import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { randomUUID } from 'node:crypto';
import type { Application } from '@nocobase/app-server/application';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  serverFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  apiValidator,
  describeRoute,
  dataResponse,
  apiErrorResponse,
  apiErrorResponses,
  executeIdempotentMutation,
  ApiError,
} from '@nocobase/app-server/router';
import {
  LifecycleError,
  lifecycleErrorFields,
  lifecycleDescriptionView,
} from '@nocobase/lifecycle';
import { ApprovalError } from '@nocobase/app-plugin-approval/server';
import { srmServiceToken } from '../providers/srm.js';
import {
  categorySchema,
  profileSchema,
  decisionSchema,
  listSchema,
  saveSchema,
  submitSchema,
  decoded,
  type Profile,
} from '../srm/schema.js';
import { businessActions, refuse } from '../srm/service.js';
import type { Company } from '../srm/lifecycle.js';

const companyView = z.object({
  id: z.string(),
  ownerId: z.string(),
  status: z.enum(['draft', 'pending', 'rejected', 'approved']),
  draft: profileSchema.nullable().optional(),
  snapshot: profileSchema.nullable(),
  creditCode: z.string().nullable(),
  supplierNo: z.string().nullable(),
  lifecycleVersion: z.number(),
  submissionVersion: z.number(),
  submittedAt: z.string().nullable(),
  admittedAt: z.string().nullable(),
});
const detailView = z.object({
  company: companyView,
  versions: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      snapshot: profileSchema,
      submittedAt: z.string(),
    }),
  ),
  runs: z.array(z.record(z.string(), z.json())),
  actions: z.array(z.record(z.string(), z.json())),
  people: z.record(z.string(), z.string()),
});
const categoryView = categorySchema.extend({ id: z.string().uuid() });
const responseSchemas: Record<string, z.ZodType> = {
  srmContext: z.object({
    permissions: z.record(z.string(), z.boolean()),
    company: companyView.optional(),
    emailVerified: z.boolean(),
  }),
  srmCategories: z.array(categoryView),
  srmSaveCategory: categoryView,
  srmProfile: detailView.nullable(),
  srmSaveProfile: companyView,
  srmSubmit: companyView,
  srmCompanyDetail: detailView,
  srmDecision: detailView,
  srmListapplications: z.array(companyView),
  srmListsuppliers: z.array(companyView),
  srmUploadFile: z.object({
    id: z.string().uuid(),
    filename: z.string(),
    size: z.union([z.string(), z.number()]),
  }),
  srmRetryEffect: z.object({ retried: z.boolean() }),
};
const document = (operationId: string, summary: string) =>
  describeRoute({
    tags: ['SRM'],
    operationId,
    summary,
    ...(operationId === 'srmUploadFile'
      ? {
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object' as const,
                  required: ['file'],
                  properties: {
                    file: { type: 'string' as const, format: 'binary' },
                  },
                },
              },
            },
          },
        }
      : {}),
    responses: {
      '200':
        operationId === 'srmDownloadFile'
          ? {
              description: 'Private qualification content',
              content: {
                'application/pdf': {
                  schema: { type: 'string', format: 'binary' },
                },
                'image/jpeg': { schema: { type: 'string', format: 'binary' } },
                'image/png': { schema: { type: 'string', format: 'binary' } },
              },
            }
          : dataResponse(
              responseSchemas[operationId] ?? z.record(z.string(), z.json()),
            ),
      '400': apiErrorResponse(400),
      '404': apiErrorResponse(404),
      '409': apiErrorResponse(409),
      ...apiErrorResponses,
    },
  });
const idSchema = z.object({ id: z.string().uuid() });

export default defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv>();
  const service = app.container.resolve(srmServiceToken);
  const auth = app.container.resolve(authenticationToken);
  router.use('/srm/*', auth.required());
  router.use('/srm/*', async (c, next) => {
    if (c.get('auth')?.credential)
      refuse('PERSON_SESSION_REQUIRED', 'PERMISSION_DENIED');
    await next();
  });
  for (const path of ['/srm/profile', '/srm/submit', '/srm/files']) {
    router.use(path, async (c, next) => {
      if (path !== '/srm/files' || c.req.method === 'POST')
        await service.require(c.get('auth')!.user.id, 'applyAdmission');
      await next();
    });
  }
  router.onError((error) => {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    if (['SQLITE_CONSTRAINT_UNIQUE', '23505', 'ER_DUP_ENTRY'].includes(code))
      refuse('COMPANY_ALREADY_REGISTERED', 'ALREADY_EXISTS');
    if (error instanceof LifecycleError) {
      const fields = lifecycleErrorFields(error);
      if (fields) throw new ApiError({ ...fields, domain: 'srm' });
    }
    if (error instanceof ApprovalError)
      throw new ApiError({
        status:
          error.code === 'CONFLICT' || error.code === 'CONTENT_CHANGED'
            ? 'ABORTED'
            : 'FAILED_PRECONDITION',
        reason: error.code,
        domain: 'srm',
        message: error.message,
      });
    throw error;
  });
  router.get(
    '/srm/context',
    document('srmContext', 'Get the current person’s admission context'),
    async (c) => {
      const user = c.get('auth')!.user;
      const permissions = Object.fromEntries(
        await Promise.all(
          businessActions.map(
            async (action) =>
              [action, await service.can(user.id, action)] as const,
          ),
        ),
      );
      return c.json({
        data: {
          permissions,
          company: permissions.applyAdmission
            ? await service.own(user.id)
            : undefined,
          emailVerified: user.emailVerified,
        },
      });
    },
  );
  router.get(
    '/srm/categories',
    document('srmCategories', 'List supplier categories'),
    async (c) =>
      c.json({ data: await service.db.repository('srmCategories').findMany() }),
  );
  router.post(
    '/srm/categories',
    document('srmSaveCategory', 'Create or revise a supply category'),
    apiValidator('json', categorySchema),
    async (c) => {
      const userId = c.get('auth')!.user.id;
      await service.require(userId, 'manageCategories');
      const input = c.req.valid('json');
      const result = await executeIdempotentMutation({
        connection: service.db.connection(),
        key: c.req.header('Idempotency-Key') ?? '',
        principal: `${app.appName}:${userId}`,
        operation: `srm.categories:${input.id ?? 'new'}`,
        input,
        authorize: () => service.require(userId, 'manageCategories'),
        authorizeReplay: () => service.require(userId, 'manageCategories'),
        execute: async (tx) => {
          const repo = tx.repository('srmCategories');
          if (!input.id)
            return (
              await repo.createOne({
                values: { ...input, id: randomUUID() },
              })
            ).record;
          const current = await repo.findOne({ filter: { id: input.id } });
          if (!current) refuse('CATEGORY_NOT_FOUND', 'NOT_FOUND');
          if (current.revision !== input.revision)
            refuse('STATE_CHANGED', 'ABORTED');
          return (
            await repo.updateOne({
              filter: { id: input.id, revision: input.revision },
              values: {
                name: input.name,
                nameEn: input.nameEn,
                active: input.active,
                revision: input.revision + 1,
              },
            })
          ).record;
        },
      });
      return c.json({ data: result.data });
    },
  );
  router.get(
    '/srm/profile',
    document('srmProfile', 'Read the current supplier profile'),
    async (c) => {
      const company = await service.own(c.get('auth')!.user.id);
      return c.json({
        data: company
          ? await service.detail(c.get('auth')!.user.id, company.id)
          : null,
      });
    },
  );
  router.post(
    '/srm/profile',
    document('srmSaveProfile', 'Save a company draft'),
    apiValidator('json', saveSchema),
    async (c) => {
      const user = c.get('auth')!.user;
      const input = c.req.valid('json');
      const key = c.req.header('Idempotency-Key') ?? '';
      const result = await executeIdempotentMutation({
        connection: service.db.connection(),
        key,
        principal: `${app.appName}:${user.id}`,
        operation: 'srm.saveProfile',
        input,
        authorize: () => service.require(user.id, 'applyAdmission'),
        authorizeReplay: () => service.require(user.id, 'applyAdmission'),
        execute: (tx) =>
          service.save(user.id, input.profile, input.expectedVersion, key, tx),
      });
      return c.json({ data: result.data });
    },
  );
  router.post(
    '/srm/submit',
    document('srmSubmit', 'Submit or resubmit supplier admission'),
    apiValidator('json', submitSchema),
    async (c) => {
      const user = c.get('auth')!.user;
      const input = c.req.valid('json');
      const key = c.req.header('Idempotency-Key') ?? '';
      const result = await executeIdempotentMutation({
        connection: service.db.connection(),
        key,
        principal: `${app.appName}:${user.id}`,
        operation: 'srm.submit',
        input,
        authorize: () => service.require(user.id, 'applyAdmission'),
        authorizeReplay: () => service.require(user.id, 'applyAdmission'),
        execute: (tx) =>
          service.submit(user.id, input.expectedVersion, key, tx),
      });
      return c.json({ data: result.data });
    },
  );
  for (const kind of ['applications', 'suppliers'] as const) {
    router.get(
      `/srm/${kind}`,
      document(`srmList${kind}`, `List ${kind}`),
      apiValidator('query', listSchema),
      async (c) => {
        await service.require(
          c.get('auth')!.user.id,
          kind === 'applications' ? 'readApplications' : 'readSuppliers',
        );
        const query = c.req.valid('query');
        const companies = await service.db
          .repository<Company>('srmCompanies')
          .findMany({
            filter:
              kind === 'suppliers'
                ? { status: 'approved' }
                : (f) => f.string('status').ne('draft'),
          });
        const rows = companies
          .map((company) => ({
            ...company,
            snapshot: decoded<Profile>(company.snapshot),
            draft: undefined,
          }))
          .filter((company) => {
            const profile = company.snapshot;
            const date = String(
              kind === 'suppliers' ? company.admittedAt : company.submittedAt,
            );
            return (
              (!query.status || company.status === query.status) &&
              (!query.q ||
                `${profile.legalName} ${profile.creditCode}`
                  .toLowerCase()
                  .includes(query.q.toLowerCase())) &&
              (!query.category ||
                profile.categories.includes(query.category)) &&
              (!query.from || date >= query.from) &&
              (!query.to || date <= query.to)
            );
          })
          .sort((a, b) =>
            String(a.submittedAt).localeCompare(String(b.submittedAt)),
          );
        return c.json({
          data: rows.slice(
            (query.page - 1) * query.pageSize,
            query.page * query.pageSize,
          ),
          meta: {
            total: rows.length,
            page: query.page,
            pageSize: query.pageSize,
          },
        });
      },
    );
  }
  router.get(
    '/srm/companies/:id',
    document(
      'srmCompanyDetail',
      'Read an authorized company and submitted versions',
    ),
    apiValidator('param', idSchema),
    async (c) =>
      c.json({
        data: await service.detail(
          c.get('auth')!.user.id,
          c.req.valid('param').id,
        ),
      }),
  );
  router.post(
    '/srm/companies/:id/decision',
    document('srmDecision', 'Perform a native approval task decision'),
    apiValidator('param', idSchema),
    apiValidator('json', decisionSchema),
    async (c) => {
      const userId = c.get('auth')!.user.id;
      const input = c.req.valid('json');
      await service.require(userId, input.action);
      const detail = await service.detail(userId, c.req.valid('param').id);
      if (detail.company.ownerId === userId)
        refuse('SELF_REVIEW_FORBIDDEN', 'PERMISSION_DENIED');
      const offered = detail.actions.find(
        (item) => item.task.id === input.taskId,
      );
      if (
        !offered &&
        !detail.runs.some((run) =>
          run.tasks.some((task) => task.id === input.taskId),
        )
      )
        refuse('STATE_CHANGED', 'ABORTED');
      if (input.action === 'reject' && !input.comment.trim())
        refuse('REJECTION_REASON_REQUIRED');
      await service.approvals.perform({
        action: input.action,
        target: { taskId: input.taskId },
        actor: { id: userId },
        contentHash: input.contentHash,
        comment: input.comment,
        requestId: c.req.header('Idempotency-Key'),
      });
      return c.json({ data: await service.detail(userId, detail.company.id) });
    },
  );
  router.get(
    '/srm/workflow',
    document(
      'srmWorkflow',
      'Inspect the admission definition and real execution history',
    ),
    async (c) => {
      await service.require(c.get('auth')!.user.id, 'inspectWorkflow');
      const effects = await service.runtime.listEffectRuns({
        lifecycle: 'srmCompanies',
      });
      const notifications = [];
      for (const effect of effects) {
        const result = effect.result;
        if (
          result &&
          typeof result === 'object' &&
          !Array.isArray(result) &&
          typeof result.notificationId === 'string'
        ) {
          const status = await app.container
            .resolve(notificationServiceToken)
            .getNotification(result.notificationId);
          if (status) notifications.push(status);
        }
      }
      return c.json({
        data: {
          description: lifecycleDescriptionView(
            service.runtime,
            'srmCompanies',
          ),
          executions: await service.db.repository('srmCompanies').findMany(),
          effects,
          notifications,
          audit: await service.db.repository('srmAudit').findMany(),
        },
      });
    },
  );
  router.get(
    '/srm/workflow/:id',
    document('srmWorkflowExecution', 'Inspect one admission execution'),
    apiValidator('param', idSchema),
    async (c) => {
      await service.require(c.get('auth')!.user.id, 'inspectWorkflow');
      const id = c.req.valid('param').id;
      return c.json({
        data: {
          company: await service.company(id),
          history: await service.runtime.history('srmCompanies', id),
        },
      });
    },
  );
  router.post(
    '/srm/notificationRetry',
    document(
      'srmRetryNotificationDelivery',
      'Retry one failed admission notification delivery',
    ),
    apiValidator(
      'json',
      z.object({
        notificationId: z.string(),
        deliveryId: z.string(),
        reason: z.string().trim().min(1).max(200),
      }),
    ),
    async (c) => {
      await service.require(c.get('auth')!.user.id, 'retryNotifications');
      const input = c.req.valid('json');
      const effects = await service.runtime.listEffectRuns({
        lifecycle: 'srmCompanies',
      });
      if (
        !effects.some(
          (effect) =>
            effect.result &&
            typeof effect.result === 'object' &&
            !Array.isArray(effect.result) &&
            effect.result.notificationId === input.notificationId,
        )
      )
        refuse('NOTIFICATION_NOT_FOUND', 'NOT_FOUND');
      const notifications = app.container.resolve(notificationServiceToken);
      const status = await notifications.getNotification(input.notificationId);
      if (
        !status?.deliveries.some((delivery) => delivery.id === input.deliveryId)
      )
        refuse('NOTIFICATION_NOT_FOUND', 'NOT_FOUND');
      return c.json({
        data: await notifications.retryDelivery({
          deliveryId: input.deliveryId,
          reason: input.reason,
        }),
      });
    },
  );
  router.post(
    '/srm/effects/:id/retry',
    document('srmRetryEffect', 'Retry a failed admission notification'),
    apiValidator('param', z.object({ id: z.string().min(1) })),
    async (c) => {
      await service.require(c.get('auth')!.user.id, 'retryNotifications');
      const id = c.req.valid('param').id;
      if (
        !(
          await service.runtime.listEffectRuns({ lifecycle: 'srmCompanies' })
        ).some((run) => String(run.id) === id)
      )
        refuse('NOTIFICATION_NOT_FOUND', 'NOT_FOUND');
      await service.runtime.retryRun(id);
      return c.json({ data: { retried: true } });
    },
  );
  router.post(
    '/srm/files',
    document(
      'srmUploadFile',
      'Upload a private PDF, JPEG or PNG qualification, at most 10 MB',
    ),
    bodyLimit({
      maxSize: 10 * 1024 * 1024 + 65536,
      onError: () => {
        throw new ApiError({
          status: 'RESOURCE_EXHAUSTED',
          reason: 'FILE_TOO_LARGE',
          domain: 'srm',
          message: 'File exceeds 10 MB.',
        });
      },
    }),
    async (c) => {
      const user = c.get('auth')!.user;
      const company = await service.own(user.id);
      if (company && !['draft', 'rejected'].includes(company.status))
        refuse('PROFILE_LOCKED');
      const body = await c.req.parseBody();
      const file = body.file;
      if (
        !(file instanceof File) ||
        file.size <= 0 ||
        file.size > 10 * 1024 * 1024
      )
        refuse('INVALID_FILE');
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const type =
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46
          ? 'application/pdf'
          : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
            ? 'image/jpeg'
            : bytes[0] === 137 &&
                bytes[1] === 80 &&
                bytes[2] === 78 &&
                bytes[3] === 71 &&
                bytes[4] === 13 &&
                bytes[5] === 10 &&
                bytes[6] === 26 &&
                bytes[7] === 10
              ? 'image/png'
              : '';
      if (
        !type ||
        type !== file.type ||
        !(
          type === 'application/pdf'
            ? /\.pdf$/i
            : type === 'image/jpeg'
              ? /\.jpe?g$/i
              : /\.png$/i
        ).test(file.name)
      )
        refuse('INVALID_FILE_TYPE');
      const files = app.container
        .resolve(serverFileRepositoryManagerToken)
        .repository('srmFiles', {
          disk: 'local',
          accessPath: '/api/srm/files',
          policy: {
            read: { scope: { ownerId: user.id } },
            create: { scope: true, defaults: { ownerId: user.id } },
            update: false,
            delete: false,
          },
        });
      const result = await files.uploadOne({ file });
      return c.json({
        data: {
          id: result.record.id,
          filename: result.record.filename,
          size: result.record.size,
        },
      });
    },
  );
  router.get(
    '/srm/files/:id',
    document(
      'srmDownloadFile',
      'Read a qualification with current company authorization',
    ),
    apiValidator('param', idSchema),
    async (c) => {
      const id = c.req.valid('param').id;
      const userId = c.get('auth')!.user.id;
      const file = await service.db
        .repository<FileRecord & { ownerId: string }>('srmFiles')
        .findOne({ filter: { id } });
      if (!file) refuse('FILE_NOT_FOUND', 'NOT_FOUND');
      if (file.ownerId === userId)
        await service.require(userId, 'applyAdmission');
      if (file.ownerId !== userId) {
        await service.require(userId, 'readApplications');
        const company = await service.own(file.ownerId);
        const versions =
          company &&
          (await service.db
            .repository('srmVersions')
            .findMany({ filter: { companyId: company.id } }));
        if (
          !versions ||
          !versions.some((v) =>
            decoded<Profile>(v.snapshot).attachments.some((a) => a.id === id),
          )
        )
          refuse('ACCESS_DENIED', 'PERMISSION_DENIED');
      }
      const disk = app.container.resolve(driveManagerToken).use(file.disk);
      c.header('Content-Type', file.mimeType);
      c.header('Cache-Control', 'private, no-store');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Content-Security-Policy', "sandbox; default-src 'none'");
      c.header(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
      return c.body(
        Readable.toWeb(
          await disk.getStream(file.key),
        ) as ReadableStream<Uint8Array>,
      );
    },
  );
  const root = new Hono();
  root.route('/', router);
  return root;
});
