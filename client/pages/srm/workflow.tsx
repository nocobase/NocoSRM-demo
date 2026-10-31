import { useState } from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import type { NotificationStatusSnapshot } from '@nocobase/app-plugin-notification/server';
import { RecordLink } from '#components/record-link';
import { BackButton } from '#components/back-button';
import { PageHeader } from '#components/page-header';
import { WorkflowExecutionDetail } from '#extensions/nocobase-workflow-management/execution-detail';
import type { RecordHistory } from '@nocobase/lifecycle';
import { Failure, StateBadge } from './feedback.js';
import { useSearchParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient, useSubmission } from '@nocobase/app-client';
import type { LifecycleDescription, EffectRun } from '@nocobase/lifecycle';
import {
  WorkflowManagementLayout,
  WorkflowDefinitionDetail,
} from '#extensions/nocobase-workflow-management/layout';
import { LifecycleDiagram } from '#components/lifecycle-diagram';
import type { FlowDiagramStepKind } from '#components/flow-diagram';
import { DataTable } from '#components/data-table';
import { Button } from '#components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { useResource, useDate, type Company } from './shared.js';

interface Workflow {
  description: { description: LifecycleDescription };
  executions: Company[];
  effects: EffectRun[];
  notifications: NotificationStatusSnapshot[];
  audit: {
    id: string;
    action: string;
    actorId: string;
    at: string;
    companyId: string;
  }[];
}

function admissionStateKind(
  state: LifecycleDescription['stateInfo'][number],
): FlowDiagramStepKind {
  if (state.name === 'pending') return 'approval';
  if (state.name === 'rejected') return 'negative';
  return state.final ? 'success' : 'start';
}

export default function WorkflowPage() {
  const { t } = useTranslation();
  const date = useDate();
  const api = useApiClient();
  const { session } = useAuthentication();
  const [retryError, setRetryError] = useState<unknown>();
  const [params, setParams] = useSearchParams();
  const selected = params.get('execution');
  const resource = useResource<Workflow>('srm/workflow');
  const submission = useSubmission({
    scope: `${session?.user.id}:srm.notificationRetry`,
  });
  const tab = params.get('tab') === 'executions' ? 'executions' : 'definitions';
  return (
    <WorkflowManagementLayout
      detail={!!selected}
      title={t('srm.workflows')}
      labels={{
        definitions: t('srm.definitions'),
        executions: t('srm.executions'),
      }}
      tab={tab}
      onTabChange={(value) => setParams({ tab: value })}
    >
      {!!retryError && <Failure error={retryError} />}
      {selected && resource.data ? (
        <ExecutionDetail
          id={selected}
          description={resource.data.description.description}
        />
      ) : resource.error ? (
        <Failure error={resource.error} retry={resource.reload} />
      ) : !resource.data ? (
        <p>{t('srm.loading')}</p>
      ) : tab === 'definitions' ? (
        <>
          <DataTable
            pagination={false}
            data={[
              { name: t('srm.admission'), strategy: t('srm.firstDecision') },
            ]}
            columns={[
              { accessorKey: 'name', header: t('srm.definitions') },
              { accessorKey: 'strategy', header: t('srm.rule') },
            ]}
          />
          <WorkflowDefinitionDetail
            diagramTitle={t('srm.admission')}
            parametersTitle={t('srm.parameters')}
            parameters={
              <p className='text-sm text-muted-foreground'>
                {t('srm.fixedProcess')}
              </p>
            }
            diagram={
              <LifecycleDiagram
                presentation='process'
                stateKind={admissionStateKind}
                description={resource.data.description.description}
                ariaLabel={t('srm.admission')}
                stateLabel={(state) => t(`srm.states.${state.name}`)}
                transitionLabel={(transition) =>
                  t(`srm.transitions.${transition.name}`)
                }
                endLabel={t('srm.end')}
              />
            }
          />
        </>
      ) : (
        <>
          <div className='flex justify-end'>
            <Button
              variant='outline'
              disabled={resource.loading}
              onClick={resource.reload}
            >
              {t('srm.refresh')}
            </Button>
          </div>
          <DataTable
            data={resource.data.executions}
            columns={[
              {
                accessorKey: 'id',
                header: t('srm.execution'),
                cell: ({ row }) => (
                  <RecordLink
                    to={`?tab=executions&execution=${row.original.id}`}
                  >
                    {row.original.snapshot?.legalName || row.original.id}
                  </RecordLink>
                ),
              },
              {
                accessorKey: 'status',
                header: t('srm.status'),
                cell: ({ row }) => <StateBadge status={row.original.status} />,
              },
              {
                accessorKey: 'submissionVersion',
                header: t('srm.versionLabel'),
              },
              {
                accessorKey: 'submittedAt',
                header: t('srm.submittedAt'),
                cell: ({ row }) => date(row.original.submittedAt),
              },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>{t('srm.deliveryStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={resource.data.notifications.flatMap((notification) =>
                  notification.deliveries.map((delivery) => ({
                    ...delivery,
                    notificationId: notification.notificationId,
                  })),
                )}
                columns={[
                  { accessorKey: 'channelName', header: t('srm.notification') },
                  {
                    accessorKey: 'status',
                    header: t('srm.status'),
                    cell: ({ row }) =>
                      t(`srm.effectStates.${row.original.status}`, {
                        defaultValue: row.original.status,
                      }),
                  },
                  { accessorKey: 'attemptCount', header: t('srm.attempts') },
                  {
                    id: 'retryDelivery',
                    header: t('srm.actions'),
                    cell: ({ row }) =>
                      row.original.status === 'failed' && (
                        <Button
                          variant='outline'
                          disabled={submission.submitting}
                          onClick={() =>
                            void submission
                              .run(
                                {
                                  notificationId: row.original.notificationId,
                                  deliveryId: row.original.id,
                                  reason: t('srm.manualRetry'),
                                },
                                (key, signal, input) =>
                                  api.request({
                                    path: 'srm/notificationRetry',
                                    method: 'POST',
                                    json: input,
                                    headers: { 'Idempotency-Key': key },
                                    signal,
                                  }),
                              )
                              .then(resource.reload)
                              .catch(setRetryError)
                          }
                        >
                          {t('srm.retry')}
                        </Button>
                      ),
                  },
                ]}
              />
              <DataTable
                data={resource.data.effects}
                columns={[
                  { accessorKey: 'effect', header: t('srm.notification') },
                  {
                    accessorKey: 'status',
                    header: t('srm.status'),
                    cell: ({ row }) =>
                      t(`srm.effectStates.${row.original.status}`, {
                        defaultValue: row.original.status,
                      }),
                  },
                  { accessorKey: 'attempts', header: t('srm.attempts') },
                  {
                    id: 'retry',
                    header: t('srm.actions'),
                    cell: ({ row }) =>
                      ['failed', 'dead'].includes(row.original.status) && (
                        <Button
                          variant='outline'
                          disabled={submission.submitting}
                          onClick={() =>
                            void submission
                              .run({ id: row.original.id }, (key, signal) =>
                                api.request({
                                  path: `srm/effects/${row.original.id}/retry`,
                                  method: 'POST',
                                  headers: { 'Idempotency-Key': key },
                                  signal,
                                }),
                              )
                              .then(resource.reload)
                              .catch(setRetryError)
                          }
                        >
                          {t('srm.retry')}
                        </Button>
                      ),
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('srm.audit')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={resource.data.audit}
                columns={[
                  { accessorKey: 'action', header: t('srm.actions') },
                  { accessorKey: 'actorId', header: t('srm.actor') },
                  { accessorKey: 'companyId', header: t('srm.company') },
                  {
                    accessorKey: 'at',
                    header: t('srm.time'),
                    cell: ({ row }) => date(row.original.at),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </WorkflowManagementLayout>
  );
}

function ExecutionDetail({
  id,
  description,
}: {
  id: string;
  description: LifecycleDescription;
}) {
  const { t } = useTranslation();
  const date = useDate();
  const resource = useResource<{ company: Company; history: RecordHistory }>(
    `srm/workflow/${id}`,
  );
  if (resource.error)
    return <Failure error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p>{t('srm.loading')}</p>;
  const { company, history } = resource.data;
  return (
    <>
      <BackButton to={{ pathname: '.', search: '?tab=executions' }} />
      <PageHeader title={company.snapshot?.legalName || company.id} />
      <WorkflowExecutionDetail
        transitions={history.transitions}
        state={company.status}
        effects={history.effectRuns}
        labels={{
          processDiagram: t('srm.admission'),
          history: t('srm.history'),
          historyHint: t('srm.historyHint'),
          step: t('srm.step'),
          transition: t('srm.actions'),
          from: t('srm.from'),
          to: t('srm.to'),
          actor: t('srm.actor'),
          time: t('srm.time'),
          noHistory: t('srm.empty'),
          effects: t('srm.deliveryStatus'),
          effect: t('srm.notification'),
          state: t('srm.status'),
          attempts: t('srm.attempts'),
          error: t('srm.error'),
          noEffects: t('srm.empty'),
          executionParameters: t('srm.parameters'),
          snapshotHint: t('srm.fixedProcess'),
          showStep: (step) => t('srm.stepNumber', { step }),
        }}
        stateLabel={(state) => t(`srm.states.${state}`)}
        transitionLabel={(name) =>
          t(`srm.transitions.${name}`, {
            defaultValue: name === '$create' ? t('srm.created') : name,
          })
        }
        dateLabel={date}
        effectStatusLabel={(status) =>
          t(`srm.effectStates.${status}`, { defaultValue: status })
        }
        renderDiagram={({ current, history: selectedHistory }) => (
          <LifecycleDiagram
            presentation='process'
            stateKind={admissionStateKind}
            description={description}
            ariaLabel={t('srm.admission')}
            currentState={current}
            history={selectedHistory}
            stateLabel={(state) => t(`srm.states.${state.name}`)}
            transitionLabel={(transition) =>
              t(`srm.transitions.${transition.name}`)
            }
            endLabel={t('srm.end')}
          />
        )}
      />
    </>
  );
}
