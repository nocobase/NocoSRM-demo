import { randomUUID } from 'node:crypto';
import {
  approvalState,
  approve,
  reject,
  defineApproval,
  stagesFor,
  type ApprovalDirectory,
} from '@nocobase/app-plugin-approval/server';
import { defineEffect, type LifecycleRecord } from '@nocobase/lifecycle';
import type { DatabaseConnection } from '@nocobase/db';
import type { Profile } from './schema.js';
import { AI_ACTOR } from './ai-schema.js';

export interface Company extends LifecycleRecord {
  id: string;
  ownerId: string;
  creditCode: string | null;
  supplierNo: string | null;
  draft: Profile;
  snapshot: Profile | null;
  submissionVersion: number;
  lifecycleVersion: number;
  status: 'draft' | 'pending' | 'rejected' | 'approved';
  submittedAt: string | null;
  admittedAt: string | null;
}
export interface SrmServices {
  connection: DatabaseConnection;
  directory: ApprovalDirectory;
  reviewers(): Promise<string[]>;
  aiReview(
    context: import('@nocobase/lifecycle').EffectContext<SrmTypes>,
  ): Promise<import('@nocobase/lifecycle').JsonObject>;
  authorizeAi(
    record: Company,
    task: import('@nocobase/app-plugin-approval/server').TaskRow,
    run: import('@nocobase/app-plugin-approval/server').RunRow,
    evidence: import('@nocobase/lifecycle').JsonObject,
  ): Promise<boolean>;
  notify(
    record: Company,
    key: string,
    state: Company['status'],
    input: import('@nocobase/lifecycle').JsonObject,
  ): Promise<{ notificationId: string } | void>;
}
export interface SrmTypes {
  record: Company;
  state: Company['status'];
  services: SrmServices;
}
const stage = stagesFor<SrmTypes>();
const owner = ({ record, actor }: { record: Company; actor: { id: string } }) =>
  actor.id === record.ownerId || {
    code: 'OWNER_ONLY',
    message: 'Only the company owner may edit or submit.',
  };
const notice = defineEffect<SrmTypes>({
  name: 'srm.admissionNotice',
  timeoutMs: 30_000,
  retry: { attempts: 5, backoffMs: 1000, factor: 2 },
  run: ({ record, services, idempotencyKey, to, input }) =>
    services.notify(record, idempotencyKey, to, input),
});
const aiReview = defineEffect<SrmTypes>({
  name: 'srm.aiReview',
  timeoutMs: 30_000,
  retry: { attempts: 1 },
  run: (context) => context.services.aiReview(context),
});

const audit: (
  context: import('@nocobase/lifecycle').TransitionHookContext<SrmTypes>,
) => Promise<void> = async ({ record, entry, actor, now, services, input }) => {
  const connection = services.connection;
  const transition = entry.transition;
  const at = now.toISOString();
  await connection.repository('srmAudit').createOne({
    values: {
      id: randomUUID(),
      actorId: actor.id,
      companyId: record.id,
      action: transition,
      details: {
        submissionVersion: record.submissionVersion,
        ...(actor.id === AI_ACTOR ? { aiReview: input.automaticApproval } : {}),
      },
      at,
    },
  });
  if (transition === 'submit' || transition === 'resubmit') {
    await connection.repository('srmVersions').createOne({
      values: {
        id: randomUUID(),
        companyId: record.id,
        version: record.submissionVersion,
        snapshot: record.snapshot,
        submittedAt: now.toISOString(),
      },
    });
  }
};

export const admission = defineApproval<SrmTypes>({
  name: 'srmCompanies',
  collection: 'srmCompanies',
  version: 1,
  initial: 'draft',
  applicant: (record) => record.ownerId,
  directory: (services) => services.directory,
  automaticApprove: {
    actorId: AI_ACTOR,
    authorize: ({ record, task, run, evidence, services }) =>
      services.authorizeAi(record, task, run, evidence),
  },
  freeze: ['snapshot', 'submissionVersion', 'creditCode'],
  states: [
    'draft',
    approvalState(
      'pending',
      stage.all({
        pools: [
          {
            key: 'procurement',
            title: 'Procurement manager',
            candidates: ({ services }) => services.reviewers(),
          },
        ],
        qualification: 'srm.procurement',
        onEmpty: 'refuse',
        actions: [approve(), reject({ reason: 'required' })],
      }),
    ),
    'rejected',
    { name: 'approved', final: true },
  ],
  create: { guard: ({ actor, values }) => actor.id === values.ownerId },
  transitions: {
    saveDraft: {
      onTransition: audit,
      from: 'draft',
      to: 'draft',
      guard: owner,
      accept: ['draft', 'creditCode'],
    },
    saveRejected: {
      onTransition: audit,
      from: 'rejected',
      to: 'rejected',
      guard: owner,
      accept: ['draft'],
    },
    submit: {
      onTransition: audit,
      from: 'draft',
      to: 'pending',
      guard: owner,
      set: ({ record, now }) => ({
        snapshot: record.draft,
        submissionVersion: record.submissionVersion + 1,
        submittedAt: now.toISOString(),
      }),
    },
    resubmit: {
      onTransition: audit,
      from: 'rejected',
      to: 'pending',
      guard: owner,
      set: ({ record, now }) => ({
        snapshot: record.draft,
        submissionVersion: record.submissionVersion + 1,
        submittedAt: now.toISOString(),
      }),
    },
    approved: {
      onTransition: audit,
      from: 'pending',
      to: 'approved',
      approvalOutcome: 'approved',
      set: ({ record, now }) => ({
        supplierNo:
          'SUP' + record.id.replaceAll('-', '').slice(0, 12).toUpperCase(),
        admittedAt: now.toISOString(),
      }),
    },
    rejected: {
      onTransition: audit,
      from: 'pending',
      to: 'rejected',
      approvalOutcome: 'rejected',
    },
  },
  onEnter: {
    pending: [notice, aiReview],
    rejected: [notice],
    approved: [notice],
  },
});
