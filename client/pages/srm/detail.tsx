import { useCategoryName } from './shared.js';
import { Failure, StateBadge } from './feedback.js';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '#components/ui/button';
import { LongText } from '#components/long-text';
import { useParams } from 'react-router';
import {
  useApiClient,
  useSubmission,
  resolveAppUrl,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import {
  approvalStepsOf,
  renderTimelineEntry,
} from '@nocobase/app-plugin-approval/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ApprovalUiProvider } from '#extensions/nocobase-approval-ui/approval-ui-provider';
import { ApprovalProgress } from '#extensions/nocobase-approval-ui/approval-progress';
import { ApprovalTimeline } from '#extensions/nocobase-approval-ui/approval-timeline';
import { ApprovalActionBar } from '#extensions/nocobase-approval-ui/approval-action-bar';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { Field, FieldLabel } from '#components/ui/field';
import { Textarea } from '#components/ui/textarea';
import {
  useResource,
  useDate,
  errorKey,
  type Profile,
  type Detail,
  type Category,
} from './shared.js';

export function ProfileView({
  profile,
  supplierNo,
  admittedAt,
}: {
  profile: Profile;
  supplierNo?: string | null;
  admittedAt?: string | null;
}) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const date = useDate();
  const categories = useResource<Category[]>('srm/categories');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.legalName || t('srm.profile')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          {supplierNo && (
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('srm.supplierNo')}
              </dt>
              <dd className='mt-1 text-sm'>{supplierNo}</dd>
            </div>
          )}
          {admittedAt && (
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('srm.admittedAt')}
              </dt>
              <dd className='mt-1 text-sm'>{date(admittedAt)}</dd>
            </div>
          )}
          {(
            [
              'legalName',
              'creditCode',
              'address',
              'introduction',
              'products',
              'contactName',
              'phone',
              'contactEmail',
              'referrerName',
            ] as const
          ).map((field) => (
            <div key={field} className='min-w-0'>
              <dt className='text-sm text-muted-foreground'>
                {t(`srm.fields.${field}`)}
              </dt>
              <dd className='mt-1 text-sm whitespace-pre-wrap wrap-anywhere'>
                {profile[field] || '—'}
              </dd>
            </div>
          ))}
          <div>
            <dt className='text-sm text-muted-foreground'>
              {t('srm.fields.categories')}
            </dt>
            <dd className='mt-1 text-sm'>
              {profile.categories
                .map((id) =>
                  ((category) => (category ? categoryName(category) : id))(
                    categories.data?.find((c) => c.id === id),
                  ),
                )
                .join(', ') || '—'}
            </dd>
          </div>
        </dl>
        <ul className='mt-5 flex flex-col gap-2'>
          {profile.attachments.map((file) => (
            <li key={file.id}>
              <a
                className='text-sm underline underline-offset-4'
                href={resolveAppUrl(`/api/srm/files/${file.id}`)}
                target='_blank'
                rel='noreferrer'
              >
                {file.name}
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
export function AdmissionHistory({ detail }: { detail: Detail }) {
  const { t } = useTranslation();
  const date = useDate();
  const name = (id: string | null | undefined) =>
    id === 'srm.aiReview'
      ? t('srm.ai.actor')
      : id
        ? (detail.people?.[id] ?? t('srm.procurement'))
        : t('srm.system');
  const text = { t, name, stage: () => t('srm.procurement') };
  const steps = approvalStepsOf(detail.runs).map((step) => ({
    ...step,
    title: t('srm.procurement'),
    policy: t('srm.firstDecision'),
    tasks: step.tasks.map((task) => ({
      key: task.id,
      personId: task.assigneeId ?? '',
      badges: [
        {
          label: t(`approval.taskStatus.${task.status}`, {
            defaultValue: task.status,
          }),
        },
      ],
      comment: task.comment,
    })),
  }));
  const lines = detail.runs
    .flatMap((view) => [
      ...view.timeline.entries,
      ...view.timeline.stages.flatMap((stage) => stage.entries),
    ])
    .map((entry) => {
      const line = renderTimelineEntry(entry, text);
      return {
        ...line,
        kind: line.kind === 'system' ? ('event' as const) : ('action' as const),
      };
    });
  return (
    <ApprovalUiProvider personName={(id) => name(id)} formatDateTime={date}>
      <Card>
        <CardHeader>
          <CardTitle>{t('srm.progress')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ApprovalProgress steps={steps} />
          <ApprovalTimeline lines={lines} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('srm.history')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {!detail.versions.length && (
            <p className='text-sm text-muted-foreground'>
              {t('srm.noSubmissions')}
            </p>
          )}
          {detail.versions.map((version) => (
            <details
              key={version.id}
              className='rounded-lg border border-border p-4'
            >
              <summary className='cursor-pointer text-sm font-medium'>
                {t('srm.version', { version: version.version })} ·{' '}
                {date(version.submittedAt)}
              </summary>
              <div className='mt-4'>
                <ProfileView profile={version.snapshot} />
              </div>
            </details>
          ))}
        </CardContent>
      </Card>
    </ApprovalUiProvider>
  );
}
export default function AdmissionDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const date = useDate();
  const api = useApiClient();
  const { session } = useAuthentication();
  const resource = useResource<Detail>(`srm/companies/${id}`);
  const operation = useSubmission({
    scope: `${session?.user.id}:srm.decision:${id}`,
  });
  const [error, setError] = useState<unknown>();
  const detail = resource.data;
  const actions =
    detail?.actions.flatMap((item) =>
      item.actions.map((action) => ({
        key: `${item.task.id}:${action.name}`,
        label: t(`srm.${action.name}`),
        tone: action.tone,
        primary: action.primary,
        form: {
          initialValues: { comment: '' },
          description: t(
            action.name === 'approve' ? 'srm.approveHint' : 'srm.rejectHint',
          ),
          validate: (values: Record<string, unknown>) =>
            action.name === 'reject' &&
            !(typeof values.comment === 'string' ? values.comment : '').trim()
              ? ['comment']
              : [],
          render: ({
            values,
            setValues,
            invalid,
          }: {
            values: Record<string, unknown>;
            setValues: (values: Record<string, unknown>) => void;
            invalid: readonly string[];
          }) => (
            <Field data-invalid={invalid.includes('comment')}>
              <FieldLabel htmlFor='decision-comment'>
                {t(action.name === 'reject' ? 'srm.reason' : 'srm.comment')}
              </FieldLabel>
              <Textarea
                id='decision-comment'
                maxLength={2000}
                aria-invalid={invalid.includes('comment')}
                value={typeof values.comment === 'string' ? values.comment : ''}
                onChange={(e) => setValues({ comment: e.target.value })}
              />
            </Field>
          ),
        },
        run: async (values: Record<string, unknown>) => {
          setError(undefined);
          try {
            const result = await operation.run(
              {
                taskId: item.task.id,
                action: action.name,
                contentHash: item.contentHash,
                comment:
                  typeof values.comment === 'string' ? values.comment : '',
              },
              (key, signal, input) =>
                api.request<{ data: Detail }>({
                  path: `srm/companies/${id}/decision`,
                  method: 'POST',
                  json: input,
                  headers: { 'Idempotency-Key': key },
                  signal,
                }),
            );
            if (result) resource.setData(result.data);
            return !!result;
          } catch (e) {
            setError(e);
            resource.reload();
            return false;
          }
        },
      })),
    ) ?? [];
  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-5xl'>
        <BackButton />
        <PageHeader
          actions={
            <Button
              variant='outline'
              size='icon'
              aria-label={t('srm.refresh')}
              title={t('srm.refresh')}
              disabled={resource.loading}
              onClick={resource.reload}
            >
              <RefreshCw className={resource.loading ? 'animate-spin' : ''} />
            </Button>
          }
          title={
            detail?.company.snapshot?.legalName || t('srm.applicationDetail')
          }
        />
        {resource.error ? (
          <Failure error={resource.error} retry={resource.reload} />
        ) : !detail ? (
          <p>{t('srm.loading')}</p>
        ) : (
          <>
            <div className='flex items-center gap-3'>
              <StateBadge status={detail.company.status} />
              <span className='text-sm text-muted-foreground'>
                {t('srm.version', {
                  version: detail.company.submissionVersion,
                })}
              </span>
            </div>
            <ProfileView
              profile={detail.company.snapshot!}
              supplierNo={detail.company.supplierNo}
              admittedAt={detail.company.admittedAt}
            />
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {t(errorKey(error), { defaultValue: t('srm.failed') })}
              </p>
            )}
            <ApprovalActionBar actions={actions} busy={operation.submitting} />
            {!!detail.aiReviews?.length && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('srm.ai.title')}</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                  {detail.aiReviews.map((review) => (
                    <div
                      key={review.id}
                      className='flex flex-col gap-2 rounded-lg border border-border p-4'
                    >
                      <p className='text-sm font-medium'>
                        {t(`srm.ai.outcomes.${review.outcome}`, {
                          defaultValue: t('srm.ai.outcomes.manual'),
                        })}{' '}
                        · {date(review.at)}
                      </p>
                      <dl className='grid gap-3 text-sm sm:grid-cols-2'>
                        {review.recommendation && (
                          <div>
                            <dt className='text-muted-foreground'>
                              {t('srm.ai.recommendation')}
                            </dt>
                            <dd>
                              {t(
                                `srm.ai.recommendations.${review.recommendation}`,
                              )}
                            </dd>
                          </div>
                        )}
                        {review.confidence !== undefined && (
                          <div>
                            <dt className='text-muted-foreground'>
                              {t('srm.ai.confidence')}
                            </dt>
                            <dd>
                              {review.confidence} / {review.threshold}
                            </dd>
                          </div>
                        )}
                        {review.model && (
                          <div>
                            <dt className='text-muted-foreground'>
                              {t('srm.ai.model')}
                            </dt>
                            <dd className='wrap-anywhere'>
                              {review.model.modelService} / {review.model.model}
                            </dd>
                          </div>
                        )}
                        {review.submissionVersion && (
                          <div>
                            <dt className='text-muted-foreground'>
                              {t('srm.versionLabel')}
                            </dt>
                            <dd>{review.submissionVersion}</dd>
                          </div>
                        )}
                      </dl>
                      {review.code && (
                        <p className='text-sm text-muted-foreground'>
                          {t('srm.ai.fallbackHint')}
                        </p>
                      )}
                      {[...new Set(review.reasons)].map((reason) => (
                        <LongText key={reason}>{reason}</LongText>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <AdmissionHistory detail={detail} />
          </>
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
