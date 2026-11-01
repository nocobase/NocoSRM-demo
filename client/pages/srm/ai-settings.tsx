import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useApiClient, useSubmission, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { BrainCircuit, LoaderCircle } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#components/ui/card';
import { Field, FieldLabel, FieldDescription } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Checkbox } from '#components/ui/checkbox';
import { Button } from '#components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '#components/ui/empty';
import {
  aiSettingsSchema,
  type AiSettings,
} from '../../../server/srm/ai-schema.js';
import { Failure } from './feedback.js';
import { useResource } from './shared.js';

export interface AiSettingsResponse {
  settings: AiSettings;
  canConfigure: boolean;
  canManageModels: boolean;
  models: { label: string; value: NonNullable<AiSettings['model']> }[];
}
export type AiSettingsResource = ReturnType<
  typeof useResource<AiSettingsResponse>
>;

export function AiReviewSettings({
  resource,
}: {
  resource: AiSettingsResource;
}) {
  const { t } = useTranslation();
  return (
    <Card id='ai-review-settings' tabIndex={-1}>
      <CardHeader>
        <CardTitle>{t('srm.ai.title')}</CardTitle>
        <CardDescription>{t('srm.ai.description')}</CardDescription>
      </CardHeader>
      {resource.error ? (
        <CardContent>
          <Failure error={resource.error} retry={resource.reload} />
        </CardContent>
      ) : !resource.data ? (
        <CardContent>
          <Skeleton className='h-48' aria-label={t('srm.loading')} />
        </CardContent>
      ) : (
        <AiSettingsForm
          key={JSON.stringify(resource.data.settings)}
          data={resource.data}
          onSaved={(settings) =>
            resource.setData({ ...resource.data!, settings })
          }
        />
      )}
    </Card>
  );
}
function AiSettingsForm({
  data,
  onSaved,
}: {
  data: AiSettingsResponse;
  onSaved: (settings: AiSettings) => void;
}) {
  const { t } = useTranslation();
  const { session } = useAuthentication();
  const api = useApiClient();
  const toaster = useToaster();
  const [enabled, setEnabled] = useState(data.settings.enabled);
  const [threshold, setThreshold] = useState(
    data.settings.threshold?.toString() ?? '',
  );
  const [model, setModel] = useState(
    data.settings.model ? JSON.stringify(data.settings.model) : '',
  );
  const [tokens, setTokens] = useState(String(data.settings.maxOutputTokens));
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<unknown>();
  const submission = useSubmission({
    scope: `${session?.user.id}:srm.aiReview.settings`,
  });
  const disabled = !data.canConfigure || submission.submitting;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    setError(undefined);
    try {
      const saved = await submission.run(
        { enabled, threshold, model, tokens },
        async (key, signal, snapshot) => {
          const values = {
            enabled: snapshot.enabled,
            threshold: snapshot.threshold.trim()
              ? Number(snapshot.threshold)
              : null,
            model:
              data.models.find(
                (entry) => JSON.stringify(entry.value) === snapshot.model,
              )?.value ?? null,
            maxOutputTokens: Number(snapshot.tokens),
          };
          const parsed = aiSettingsSchema.safeParse(values);
          if (!parsed.success) {
            const invalid = Object.fromEntries(
              parsed.error.issues.map((issue) => [String(issue.path[0]), true]),
            );
            setErrors(invalid);
            document.getElementById(`ai-${Object.keys(invalid)[0]}`)?.focus();
            return;
          }
          setErrors({});
          return api.request<{ data: AiSettings }>({
            path: 'srm/aiReview/settings',
            method: 'PUT',
            json: parsed.data,
            headers: { 'Idempotency-Key': key },
            signal,
          });
        },
      );
      if (saved) {
        onSaved(saved.data);
        toaster.show({ type: 'success', title: t('srm.ai.saved') });
      }
    } catch (cause) {
      setError(cause);
    }
  };
  const corrected = (field: string, valid: boolean) =>
    setErrors((current) =>
      attempted ? { ...current, [field]: !valid } : current,
    );
  const validThreshold = (value: string, required = enabled) =>
    value.trim()
      ? Number.isFinite(Number(value)) &&
        Number(value) >= 0 &&
        Number(value) <= 1
      : !required;
  const validTokens = (value: string) =>
    Number.isInteger(Number(value)) &&
    Number(value) >= 128 &&
    Number(value) <= 4096;
  return (
    <form
      onSubmit={(event) => {
        void save(event);
      }}
      noValidate
    >
      <CardContent className='flex flex-col gap-4'>
        {!!error && <Failure error={error} />}
        <Field orientation='horizontal'>
          <Checkbox
            id='ai-enabled'
            checked={enabled}
            disabled={disabled}
            onCheckedChange={(value) => {
              setEnabled(!!value);
              corrected('threshold', validThreshold(threshold, !!value));
              corrected('model', !value || !!model);
            }}
          />
          <FieldLabel htmlFor='ai-enabled'>{t('srm.ai.enabled')}</FieldLabel>
        </Field>
        <p className='text-sm text-muted-foreground'>
          {t('srm.ai.enableHint')}
        </p>
        <p className='text-sm text-muted-foreground'>
          {t('srm.ai.inputScope')}
        </p>
        {!data.models.length && (
          <Empty className='min-h-40 border border-dashed p-6'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <BrainCircuit />
              </EmptyMedia>
              <EmptyTitle>{t('srm.ai.noModels')}</EmptyTitle>
              <EmptyDescription>{t('srm.ai.noModelsHint')}</EmptyDescription>
            </EmptyHeader>
            {data.canManageModels && (
              <EmptyContent>
                <Button
                  variant='outline'
                  render={<Link to='/settings/models' />}
                >
                  {t('srm.ai.models')}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}
        <Field data-invalid={!!errors.model}>
          <FieldLabel htmlFor='ai-model'>
            {t('srm.ai.model')}
            {enabled && ' *'}
          </FieldLabel>
          <Select
            value={model}
            onValueChange={(value) => {
              setModel(value ?? '');
              corrected('model', !enabled || !!value);
            }}
            disabled={disabled || !data.models.length}
          >
            <SelectTrigger
              id='ai-model'
              className='w-full'
              aria-invalid={!!errors.model}
            >
              <SelectValue>
                {data.models.find(
                  (entry) => JSON.stringify(entry.value) === model,
                )?.label ?? t('srm.ai.selectModel')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
              {data.models.map((entry) => (
                <SelectItem
                  key={JSON.stringify(entry.value)}
                  value={JSON.stringify(entry.value)}
                >
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.model && (
            <p className='text-sm text-destructive'>
              {t('srm.ai.invalidModel')}
            </p>
          )}
        </Field>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field data-invalid={!!errors.threshold}>
            <FieldLabel htmlFor='ai-threshold'>
              {t('srm.ai.threshold')}
              {enabled && ' *'}
            </FieldLabel>
            <Input
              id='ai-threshold'
              type='number'
              min='0'
              max='1'
              step='any'
              value={threshold}
              disabled={disabled}
              aria-invalid={!!errors.threshold}
              onChange={(event) => {
                setThreshold(event.target.value);
                corrected('threshold', validThreshold(event.target.value));
              }}
            />
            <FieldDescription>{t('srm.ai.thresholdHint')}</FieldDescription>
            {errors.threshold && (
              <p className='text-sm text-destructive'>
                {t('srm.ai.invalidThreshold')}
              </p>
            )}
          </Field>
          <Field data-invalid={!!errors.maxOutputTokens}>
            <FieldLabel htmlFor='ai-maxOutputTokens'>
              {t('srm.ai.tokens')} *
            </FieldLabel>
            <Input
              id='ai-maxOutputTokens'
              type='number'
              min='128'
              max='4096'
              value={tokens}
              disabled={disabled}
              aria-invalid={!!errors.maxOutputTokens}
              onChange={(event) => {
                setTokens(event.target.value);
                corrected('maxOutputTokens', validTokens(event.target.value));
              }}
            />
            {errors.maxOutputTokens && (
              <p className='text-sm text-destructive'>
                {t('srm.ai.invalidTokens')}
              </p>
            )}
          </Field>
        </div>
        {data.canManageModels && !!data.models.length && (
          <Link
            className='text-sm underline underline-offset-4'
            to='/settings/models'
          >
            {t('srm.ai.models')}
          </Link>
        )}
        {!data.canConfigure && (
          <p className='text-sm text-muted-foreground'>
            {t('srm.ai.readOnly')}
          </p>
        )}
      </CardContent>
      {data.canConfigure && (
        <CardFooter className='justify-end'>
          <Button type='submit' disabled={submission.submitting}>
            {submission.submitting && (
              <LoaderCircle aria-hidden className='animate-spin' />
            )}
            {t(submission.submitting ? 'srm.ai.saving' : 'srm.ai.save')}
          </Button>
        </CardFooter>
      )}
    </form>
  );
}
