import { randomUUID } from 'node:crypto';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  ApprovalService,
  type Approval,
} from '@nocobase/app-plugin-approval/server';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { i18nToken } from '@nocobase/app-server/i18n';
import { ApiError } from '@nocobase/app-server/router';
import { admission, type Company, type SrmServices } from './lifecycle.js';
import { decoded, profileSchema, type Profile } from './schema.js';
import { AiReviewService } from './ai-review.js';

export function refuse(
  reason: string,
  status:
    | 'PERMISSION_DENIED'
    | 'FAILED_PRECONDITION'
    | 'NOT_FOUND'
    | 'ABORTED'
    | 'ALREADY_EXISTS' = 'FAILED_PRECONDITION',
): never {
  throw new ApiError({ status, reason, domain: 'srm', message: reason });
}
export const businessActions = [
  'applyAdmission',
  'readApplications',
  'approve',
  'reject',
  'readSuppliers',
  'manageCategories',
  'inspectWorkflow',
  'retryNotifications',
  'configureAiReview',
] as const;

/** Workflow inspection does not grant access to internal model evidence. */
export function redactAiEvidence<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactAiEvidence) as T;
  if (!value || typeof value !== 'object' || value instanceof Date)
    return value;
  const row = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(row)
      .filter(
        ([key]) =>
          key !== 'automaticApproval' &&
          key !== 'aiReview' &&
          !(key === 'result' && row.effect === 'srm.aiReview') &&
          !(key === 'details' && row.action === 'aiReview'),
      )
      .map(([key, item]) => [key, redactAiEvidence(item)]),
  ) as T;
}

export class SrmService {
  readonly db;
  readonly runtime: LifecycleRuntime;
  readonly approvals: ApprovalService;
  readonly ai: AiReviewService;
  effectDispatcher?: import('@nocobase/lifecycle').EffectDispatcher;
  constructor(readonly app: Application) {
    this.db = app.container.resolve(databaseManagerToken);
    this.runtime = new LifecycleRuntime({
      dispatcher: {
        dispatch: (id, options) => {
          if (!this.effectDispatcher)
            throw new Error('Admission effect jobs are not started.');
          return this.effectDispatcher.dispatch(id, options);
        },
      },
      store: createRepositoryLifecycleStore(this.db, {
        collections: {
          transitions: 'srmTransitions',
          effectRuns: 'srmEffectRuns',
        },
      }),
    });
    const services = (handle: unknown): SrmServices =>
      this.services(
        (handle as DatabaseConnection | undefined) ?? this.db.connection(),
      );
    this.runtime.register(admission, { services });
    this.approvals = new ApprovalService(
      this.runtime,
      [admission.approval as unknown as Approval<never>],
      services,
    );
    this.ai = new AiReviewService(this);
  }
  async can(
    userId: string,
    action: string,
    connection = this.db.connection(),
  ): Promise<boolean> {
    const authz = this.app.container.resolve(authorizationToken);
    if (
      action === 'approve' ||
      action === 'reject' ||
      action === 'applyAdmission'
    ) {
      const sets = await authz.permissionSets
        .withTransaction(connection)
        .getEffective({ principal: { type: 'user', id: userId } });
      return sets.some((set) =>
        set.grants.some(
          (grant) =>
            grant.resource.type === 'settings' &&
            grant.resource.id === 'srm.business' &&
            grant.actions.some((a) => a.action === action),
        ),
      );
    }
    const context = authz.for({ principal: { type: 'user', id: userId } });
    return context.can({
      resource: { type: 'settings', id: 'srm.business' },
      action,
    });
  }
  async require(
    userId: string,
    action: string,
    connection = this.db.connection(),
  ): Promise<void> {
    if (!(await this.can(userId, action, connection)))
      refuse('ACCESS_DENIED', 'PERMISSION_DENIED');
  }
  services(connection: DatabaseConnection): SrmServices {
    const users = this.app.container.resolve(userAdministrationServiceToken);
    return {
      connection,
      aiReview: (context) => this.ai.review(context),
      authorizeAi: (record, task, run, evidence) =>
        this.ai.authorize(record, task, run, evidence, connection),
      reviewers: async () => {
        const assignments = await this.app.container
          .resolve(authorizationToken)
          .permissionSets.withTransaction(connection)
          .listAssignments();
        const ids = [
          ...new Set(
            assignments
              .filter((a) => a.subject.type === 'user')
              .map((a) => a.subject.id),
          ),
        ];
        const result: string[] = [];
        for (const id of ids)
          if (await this.can(id, 'approve', connection)) {
            const user = await users.withConnection(connection).get(id);
            if (user && !user.disabledAt) result.push(id);
          }
        return result;
      },
      directory: {
        isActive: async (id) => {
          const user = await users.withConnection(connection).get(id);
          return !!user && !user.disabledAt;
        },
        managerOf: () => undefined,
        hasRole: (id) => this.can(id, 'approve', connection),
      },
      notify: async (record, key, state, input) => {
        const to =
          state === 'pending'
            ? await this.services(this.db.connection()).reviewers()
            : [record.ownerId];
        if (!to.length)
          throw new Error('Admission notification has no active recipients.');
        const runs = await this.approvals.runViewsFor(
          'srmCompanies',
          record.id,
        );
        const run =
          typeof input.runId === 'string'
            ? runs.find((view) => view.run.id === input.runId)
            : undefined;
        const version = Number(
          input.submissionVersion ??
            run?.run.content.submissionVersion ??
            record.submissionVersion,
        );
        const submitted = await this.db
          .repository('srmVersions')
          .findOne({ filter: { companyId: record.id, version } });
        if (!submitted)
          throw new Error('Admission submission snapshot is missing.');
        const profile = decoded<Profile>(submitted.snapshot);
        const comment =
          run?.tasks.find((task) => task.actorId && task.comment)?.comment ??
          '';
        const locale =
          this.app.config.get<{ defaultLocale: string }>('i18n')
            ?.defaultLocale ?? 'en-US';
        const t = this.app.container
          .resolve(i18nToken)
          .getFixedT('nocosrm-demo', locale);
        const sent = await this.app.container
          .resolve(notificationServiceToken)
          .send({
            idempotencyKey: key,
            source: { type: 'srm', referenceId: record.id },
            messages: {
              inbox: {
                to,
                title: t(`srm.notifications.${state}`),
                body: t('srm.notifications.body', {
                  company: profile.legalName,
                  version,
                  time:
                    state === 'approved'
                      ? (record.admittedAt ?? '')
                      : new Date(submitted.submittedAt as string).toISOString(),
                  comment,
                }),
                target: {
                  type: 'route',
                  path:
                    state === 'pending'
                      ? `/applications/${record.id}`
                      : '/admission',
                },
              },
            },
          });
        return { notificationId: sent.notificationId };
      },
    };
  }
  async company(
    id: string,
    connection = this.db.connection(),
  ): Promise<Company> {
    const row = await connection
      .repository<Company>('srmCompanies')
      .findOne({ filter: { id } });
    if (!row) refuse('COMPANY_NOT_FOUND', 'NOT_FOUND');
    return {
      ...row,
      draft: decoded<Profile>(row.draft),
      snapshot: row.snapshot ? decoded<Profile>(row.snapshot) : null,
    };
  }
  async own(
    userId: string,
    connection = this.db.connection(),
  ): Promise<Company | undefined> {
    const row = await connection
      .repository<Company>('srmCompanies')
      .findOne({ filter: { ownerId: userId } });
    return row ? this.company(String(row.id), connection) : undefined;
  }
  async ensureCompany(
    userId: string,
    referrerName: string,
    connection: DatabaseConnection,
  ): Promise<Company> {
    await this.require(userId, 'applyAdmission', connection);
    const existing = await this.own(userId, connection);
    if (existing) return existing;
    const id = randomUUID();
    await this.runtime.create(
      'srmCompanies',
      {
        id,
        ownerId: userId,
        draft: profileSchema.parse({ referrerName }),
        submissionVersion: 0,
        createdAt: new Date().toISOString(),
      },
      { actor: { id: userId }, transaction: connection },
    );
    await connection.repository('srmAudit').createOne({
      values: {
        id: randomUUID(),
        actorId: userId,
        companyId: id,
        action: 'bindCompany',
        details: {},
        at: new Date().toISOString(),
      },
    });
    return this.company(id, connection);
  }
  async save(
    userId: string,
    profile: Profile,
    expectedVersion: number,
    key: string,
    connection: DatabaseConnection,
  ): Promise<Company> {
    await this.require(userId, 'applyAdmission', connection);
    const existing = await this.own(userId, connection);
    const company = await this.ensureCompany(
      userId,
      profile.referrerName,
      connection,
    );
    if (!existing && expectedVersion === 0)
      expectedVersion = company.lifecycleVersion;
    if (company.status !== 'draft' && company.status !== 'rejected')
      refuse('PROFILE_LOCKED');
    if (company.lifecycleVersion !== expectedVersion)
      refuse('STATE_CHANGED', 'ABORTED');
    if (company.creditCode && profile.creditCode !== company.creditCode)
      refuse('CREDIT_CODE_LOCKED');
    if (profile.creditCode && !company.creditCode) {
      const duplicate = await connection
        .repository('srmCompanies')
        .exists({ filter: { creditCode: profile.creditCode } });
      if (duplicate) refuse('COMPANY_ALREADY_REGISTERED', 'ALREADY_EXISTS');
    }
    await this.validateFiles(userId, profile, connection);
    await this.runtime.fire(
      'srmCompanies',
      company.id,
      company.status === 'draft' ? 'saveDraft' : 'saveRejected',
      {
        actor: { id: userId },
        requestId: key,
        input: {
          draft: profile,
          ...(company.creditCode
            ? {}
            : { creditCode: profile.creditCode || null }),
        },
        expect: { version: expectedVersion },
        transaction: connection,
      },
    );
    return this.company(company.id, connection);
  }
  async validateFiles(
    userId: string,
    profile: Profile,
    connection: DatabaseConnection,
  ): Promise<void> {
    if (
      new Set(profile.attachments.map((f) => f.id)).size !==
      profile.attachments.length
    )
      refuse('INVALID_ATTACHMENTS');
    for (const file of profile.attachments) {
      if (
        !(await connection
          .repository('srmFiles')
          .exists({ filter: { id: file.id, ownerId: userId } }))
      )
        refuse('INVALID_ATTACHMENTS');
    }
  }
  async submit(
    userId: string,
    expectedVersion: number,
    key: string,
    connection: DatabaseConnection,
  ): Promise<Company> {
    await this.require(userId, 'applyAdmission', connection);
    const company = await this.own(userId, connection);
    if (!company) refuse('PROFILE_REQUIRED');
    if (company.status !== 'draft' && company.status !== 'rejected')
      refuse('PROFILE_LOCKED');
    const p = company.draft;
    const required: (keyof Profile)[] = [
      'legalName',
      'creditCode',
      'address',
      'products',
      'contactName',
      'phone',
      'contactEmail',
    ];
    const missing = required.filter((field) => !p[field]);
    if (
      missing.length ||
      !p.categories.length ||
      !p.attachments.some((f) => f.kind === 'license')
    ) {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'PROFILE_INCOMPLETE',
        domain: 'srm',
        message:
          'Complete all required profile fields and upload a business license.',
        fieldViolations: [
          ...missing,
          ...(!p.categories.length ? ['categories'] : []),
          ...(!p.attachments.some((f) => f.kind === 'license')
            ? ['attachments']
            : []),
        ].map((field) => ({ field, description: 'Required' })),
      });
    }
    for (const id of p.categories)
      if (
        !(await connection
          .repository('srmCategories')
          .exists({ filter: { id, active: true } }))
      )
        refuse('CATEGORY_UNAVAILABLE');
    await this.validateFiles(userId, p, connection);
    // Configuration failures fail open to the existing human task, never to approval.
    let aiReview: import('@nocobase/lifecycle').JsonObject | null = null;
    try {
      aiReview = await this.ai.settings(connection);
    } catch {
      /* captured as manual fallback by the effect */
    }
    await this.runtime.fire(
      'srmCompanies',
      company.id,
      company.status === 'draft' ? 'submit' : 'resubmit',
      {
        input: { submissionVersion: company.submissionVersion + 1, aiReview },
        actor: { id: userId },
        requestId: key,
        manual: true,
        expect: { version: expectedVersion },
        transaction: connection,
      },
    );
    return this.company(company.id, connection);
  }
  async detail(userId: string, id: string) {
    const own = await this.own(userId);
    if (
      own?.id !== id &&
      !(await this.can(userId, 'readApplications')) &&
      !(await this.can(userId, 'readSuppliers'))
    )
      refuse('ACCESS_DENIED', 'PERMISSION_DENIED');
    const company = await this.company(id);
    const owner =
      company.ownerId === userId && (await this.can(userId, 'applyAdmission'));
    if (
      !owner &&
      (company.status === 'draft' ||
        (!(await this.can(userId, 'readApplications')) &&
          !(
            company.status === 'approved' &&
            (await this.can(userId, 'readSuppliers'))
          )))
    )
      refuse('ACCESS_DENIED', 'PERMISSION_DENIED');
    const versions = await this.db.repository('srmVersions').findMany({
      filter: { companyId: id },
      sort: (s) => s.field('version').desc(),
    });
    const runs = await this.approvals.runViewsFor('srmCompanies', id);
    const actions =
      !owner && (await this.can(userId, 'approve'))
        ? await this.approvals.actionsFor('srmCompanies', id, { id: userId })
        : [];
    const people: Record<string, string> = {};
    const reviewerIds = new Set([
      company.ownerId,
      ...runs
        .flatMap((view) => [
          view.run.startedBy,
          view.run.endedBy,
          ...view.tasks.flatMap((task) => [task.assigneeId, task.actorId]),
        ])
        .filter((id): id is string => !!id),
    ]);
    for (const id of reviewerIds) {
      const user = await this.app.container
        .resolve(userAdministrationServiceToken)
        .get(id);
      if (user) people[id] = user.name;
    }
    const actionsWithHash = actions.map((item) => ({
      ...item,
      contentHash: runs.find((view) => view.run.id === item.task.runId)?.run
        .contentHash,
    }));
    const mayReadAi = !owner && (await this.can(userId, 'readApplications'));
    // Native history remains visible to applicants, but internal model evidence is reviewer-only.
    const aiReviews = mayReadAi
      ? await this.db.repository('srmAudit').findMany({
          filter: { companyId: id },
          sort: (sort) => sort.field('at').desc(),
        })
      : [];
    // A committed approval is authoritative even if its effect's completion times out.
    const committedAi = new Set(
      aiReviews.flatMap((entry) => {
        const details = decoded<import('@nocobase/lifecycle').JsonObject>(
          entry.details,
        );
        const evidence = details.aiReview;
        return entry.action === 'approved' &&
          evidence &&
          typeof evidence === 'object' &&
          !Array.isArray(evidence) &&
          typeof evidence.effectRunId === 'string'
          ? [evidence.effectRunId]
          : [];
      }),
    );
    const failedAi = mayReadAi
      ? await this.db.repository('srmEffectRuns').findMany({
          filter: { recordId: id, effect: 'srm.aiReview', status: 'failed' },
        })
      : [];
    return {
      company: { ...company, draft: owner ? company.draft : company.snapshot },
      versions: versions.map((v) => ({
        ...v,
        snapshot: decoded<Profile>(v.snapshot),
      })),
      runs: mayReadAi ? runs : redactAiEvidence(runs),
      actions: actionsWithHash,
      people,
      ...(mayReadAi
        ? {
            aiReviews: [
              ...aiReviews.flatMap((entry) => {
                const details = decoded<
                  import('@nocobase/lifecycle').JsonObject
                >(entry.details);
                if (entry.action === 'aiReview')
                  return [{ id: entry.id as string, at: entry.at, ...details }];
                if (
                  entry.action === 'approved' &&
                  details.aiReview &&
                  typeof details.aiReview === 'object' &&
                  !Array.isArray(details.aiReview)
                )
                  return [
                    {
                      id: entry.id as string,
                      at: entry.at,
                      ...details.aiReview,
                      outcome: 'automatic',
                    },
                  ];
                return [];
              }),
              ...failedAi
                .filter(
                  (entry) =>
                    !committedAi.has(
                      String(entry.id as string | number | bigint),
                    ),
                )
                .map((entry) => ({
                  id: String(entry.id as string | number | bigint),
                  at: entry.updatedAt,
                  effectRunId: String(entry.id as string | number | bigint),
                  outcome: 'manual',
                  code: 'timeoutOrFailure',
                })),
            ],
          }
        : {}),
    };
  }
}
