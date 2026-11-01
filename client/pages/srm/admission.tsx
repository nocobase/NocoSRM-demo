import { profileSchema } from '../../../server/srm/schema.js';
import { useCategoryName } from './shared.js';
import { Failure, StateBadge } from './feedback.js';
import { useSettingsLeave } from '../settings/hooks.js';
import { useState } from 'react';
import {
  useApiClient,
  useSubmission,
  resolveAppUrl,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Checkbox } from '#components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '#components/ui/alert-dialog';
import {
  useResource,
  emptyProfile,
  errorKey,
  invalidFields,
  type Profile,
  type Detail,
  type Category,
} from './shared.js';
import { AdmissionHistory, ProfileView } from './detail.js';

const fields = [
  'legalName',
  'creditCode',
  'address',
  'introduction',
  'products',
  'contactName',
  'phone',
  'contactEmail',
  'referrerName',
] as const;
export default function AdmissionPage() {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const api = useApiClient();
  const { session } = useAuthentication();
  const resource = useResource<Detail | null>('srm/profile');
  const categories = useResource<Category[]>('srm/categories');
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [saved, setSaved] = useState(JSON.stringify(emptyProfile));
  const [error, setError] = useState<unknown>();
  const [invalid, setInvalid] = useState<string[]>([]);
  const [validation, setValidation] = useState<Record<string, string>>({});
  const [declaration, setDeclaration] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<'license' | 'other'>('license');
  const [materialName, setMaterialName] = useState('');
  const operation = useSubmission({ scope: `${session?.user.id}:srm.profile` });
  const submitOperation = useSubmission({
    scope: `${session?.user.id}:srm.submit`,
  });
  const company = resource.data?.company;
  const editable =
    !company || company.status === 'draft' || company.status === 'rejected';
  const dirty = JSON.stringify(profile) !== saved;
  const leave = useSettingsLeave(
    dirty,
    operation.submitting || submitOperation.submitting || uploading,
  );
  const [loaded, setLoaded] = useState<Detail | null>();
  if (resource.data !== undefined && loaded !== resource.data) {
    setLoaded(resource.data);
    if (resource.data !== undefined) {
      const value = resource.data?.company.draft ?? {
        ...emptyProfile,
        referrerName: String(
          (session?.user as { referrerName?: string } | undefined)
            ?.referrerName ?? '',
        ),
      };
      setProfile(value);
      setSaved(JSON.stringify(value));
    }
  }
  const save = async () => {
    setError(undefined);
    setSuccess('');
    setInvalid([]);
    try {
      const result = await operation.run(
        { profile, expectedVersion: company?.lifecycleVersion ?? 0 },
        (key, signal, input) =>
          api.request<{ data: Detail['company'] }>({
            path: 'srm/profile',
            method: 'POST',
            json: input,
            headers: { 'Idempotency-Key': key },
            signal,
          }),
      );
      if (!result) return;
      setSaved(JSON.stringify(result.data.draft));

      resource.setData({
        ...(resource.data ?? { versions: [], runs: [], actions: [] }),
        company: result.data,
      });
      return result.data;
    } catch (e) {
      setError(e);
      const fields = invalidFields(e);
      setInvalid(fields);
      document.getElementById(`srm-${fields[0] ?? ''}`)?.focus();
    }
  };
  const submit = async () => {
    setError(undefined);
    setSuccess('');
    try {
      const currentCompany = dirty || !company ? await save() : company;
      if (!currentCompany) {
        setConfirm(false);
        return;
      }
      setSuccess('');
      const result = await submitOperation.run(
        { expectedVersion: currentCompany.lifecycleVersion, declaration },
        (key, signal, input) =>
          api.request({
            path: 'srm/submit',
            method: 'POST',
            json: input,
            headers: { 'Idempotency-Key': key },
            signal,
          }),
      );
      if (!result) return;
      setConfirm(false);
      setDeclaration(false);
      setSuccess('srm.submitted');
      resource.reload();
    } catch (e) {
      setError(e);
      const fields = invalidFields(e);
      setInvalid(fields);
      document.getElementById(`srm-${fields[0] ?? ''}`)?.focus();
      setConfirm(false);
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (profile.attachments.length >= 10 || file.size > 10 * 1024 * 1024) {
      setError(new Error('FILE_LIMIT'));
      return;
    }
    setUploading(true);
    setError(undefined);
    try {
      const body = new FormData();
      body.set('file', file);
      const result = await api.request<{
        data: { id: string; filename: string };
      }>({ path: 'srm/files', method: 'POST', body });
      setProfile((p) => ({
        ...p,
        attachments: [
          ...p.attachments,
          {
            id: result.data.id,
            kind,
            name:
              kind === 'license'
                ? t('srm.license')
                : materialName.trim() || result.data.filename,
          },
        ],
      }));
    } catch (e) {
      setError(e);
      const fields = invalidFields(e);
      setInvalid(fields);
      document.getElementById(`srm-${fields[0] ?? ''}`)?.focus();
    } finally {
      setUploading(false);
    }
  };
  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('srm.admission')}
        description={t('srm.admissionDescription')}
      />
      {resource.error ? (
        <Failure error={resource.error} retry={resource.reload} />
      ) : resource.data === undefined ? (
        <p>{t('srm.loading')}</p>
      ) : (
        <>
          {company && (
            <div className='flex items-center gap-3'>
              <StateBadge status={company.status} />
              <span className='text-sm text-muted-foreground'>
                {t('srm.version', { version: company.submissionVersion })}
              </span>
            </div>
          )}
          {!!error && (
            <p role='alert' className='text-sm text-destructive'>
              {t(errorKey(error), { defaultValue: t('srm.failed') })}
            </p>
          )}
          {success && (
            <p role='status' className='text-sm text-primary'>
              {t(success)}
            </p>
          )}
          {editable ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('srm.profile')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FieldGroup className='grid gap-5 sm:grid-cols-2'>
                    {fields.map((name) => (
                      <Field key={name} data-invalid={invalid.includes(name)}>
                        <FieldLabel htmlFor={`srm-${name}`}>
                          {t(`srm.fields.${name}`)}
                          {!['introduction', 'referrerName'].includes(name) &&
                            ' *'}
                        </FieldLabel>
                        {name === 'introduction' ||
                        name === 'products' ||
                        name === 'address' ? (
                          <Textarea
                            id={`srm-${name}`}
                            aria-invalid={invalid.includes(name)}
                            value={profile[name]}
                            maxLength={
                              name === 'introduction'
                                ? 4000
                                : name === 'address'
                                  ? 500
                                  : 2000
                            }
                            onChange={(e) =>
                              setProfile((p) => ({
                                ...p,
                                [name]: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <Input
                            id={`srm-${name}`}
                            aria-invalid={invalid.includes(name)}
                            value={profile[name]}
                            maxLength={
                              name === 'creditCode'
                                ? 18
                                : name === 'referrerName'
                                  ? 100
                                  : 254
                            }
                            disabled={
                              name === 'creditCode' && !!company?.creditCode
                            }
                            type={name === 'contactEmail' ? 'email' : 'text'}
                            onChange={(e) =>
                              setProfile((p) => ({
                                ...p,
                                [name]: e.target.value,
                              }))
                            }
                          />
                        )}
                        {invalid.includes(name) && (
                          <FieldError>
                            {validation[name] ??
                              t(`srm.validation.${name}`, {
                                defaultValue: t('srm.invalidField'),
                              })}
                          </FieldError>
                        )}
                        {name === 'referrerName' && (
                          <FieldDescription>
                            {t('srm.referrerHint')}
                          </FieldDescription>
                        )}
                        {name === 'creditCode' && company?.creditCode && (
                          <FieldDescription>
                            {t('srm.creditLocked')}
                          </FieldDescription>
                        )}
                      </Field>
                    ))}
                  </FieldGroup>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('srm.fields.categories')} *</CardTitle>
                </CardHeader>
                <CardContent id='srm-categories' tabIndex={-1}>
                  {invalid.includes('categories') && (
                    <FieldError>{t('srm.validation.categories')}</FieldError>
                  )}
                  <FieldGroup>
                    {categories.data
                      ?.filter(
                        (cat) =>
                          cat.active || profile.categories.includes(cat.id),
                      )
                      .map((cat) => (
                        <Field key={cat.id} orientation='horizontal'>
                          <Checkbox
                            id={`category-${cat.id}`}
                            disabled={
                              !cat.active &&
                              !profile.categories.includes(cat.id)
                            }
                            checked={profile.categories.includes(cat.id)}
                            onCheckedChange={(checked) =>
                              setProfile((p) => ({
                                ...p,
                                categories: checked
                                  ? [...p.categories, cat.id]
                                  : p.categories.filter((id) => id !== cat.id),
                              }))
                            }
                          />
                          <FieldLabel htmlFor={`category-${cat.id}`}>
                            {categoryName(cat)}
                            {!cat.active && ` (${t('srm.inactive')})`}
                          </FieldLabel>
                        </Field>
                      ))}
                    {!!categories.error && (
                      <Failure
                        error={categories.error}
                        retry={categories.reload}
                      />
                    )}
                  </FieldGroup>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('srm.attachments')}</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                  {invalid.includes('attachments') && (
                    <FieldError>{t('srm.validation.attachments')}</FieldError>
                  )}
                  <p className='text-sm text-muted-foreground'>
                    {t('srm.fileHint')}
                  </p>
                  <FieldGroup>
                    <Field orientation='horizontal'>
                      <Checkbox
                        id='otherMaterial'
                        checked={kind === 'other'}
                        onCheckedChange={(checked) =>
                          setKind(checked ? 'other' : 'license')
                        }
                      />
                      <FieldLabel htmlFor='otherMaterial'>
                        {t('srm.otherMaterial')}
                      </FieldLabel>
                    </Field>
                    {kind === 'other' && (
                      <Field>
                        <FieldLabel htmlFor='materialName'>
                          {t('srm.materialName')}
                        </FieldLabel>
                        <Input
                          id='materialName'
                          maxLength={100}
                          value={materialName}
                          onChange={(e) => setMaterialName(e.target.value)}
                        />
                      </Field>
                    )}
                    <Field>
                      <FieldLabel htmlFor='srmFile'>
                        {t(uploading ? 'srm.uploading' : 'srm.upload')}
                      </FieldLabel>
                      <Input
                        id='srmFile'
                        type='file'
                        accept='.pdf,.jpg,.jpeg,.png'
                        disabled={uploading || profile.attachments.length >= 10}
                        onChange={(e) => {
                          void upload(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </Field>
                  </FieldGroup>
                  <ul className='flex flex-col gap-2'>
                    {profile.attachments.map((file) => (
                      <li
                        key={file.id}
                        className='flex items-center justify-between gap-3'
                      >
                        <a
                          className='text-sm underline underline-offset-4'
                          href={resolveAppUrl(`/api/srm/files/${file.id}`)}
                          target='_blank'
                          rel='noreferrer'
                        >
                          {file.name}
                        </a>
                        <Button
                          variant='ghost'
                          onClick={() =>
                            setProfile((p) => ({
                              ...p,
                              attachments: p.attachments.filter(
                                (f) => f.id !== file.id,
                              ),
                            }))
                          }
                        >
                          {t('srm.remove')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Field orientation='horizontal'>
                <Checkbox
                  id='srmDeclaration'
                  checked={declaration}
                  onCheckedChange={(value) => setDeclaration(!!value)}
                />
                <FieldLabel htmlFor='srmDeclaration'>
                  {t('srm.declaration')}
                </FieldLabel>
              </Field>
              {dirty && (
                <p className='text-sm text-muted-foreground'>
                  {t('srm.unsaved')}
                </p>
              )}
              <div className='flex flex-wrap justify-end gap-3'>
                <Button
                  disabled={
                    !declaration ||
                    operation.submitting ||
                    submitOperation.submitting ||
                    uploading
                  }
                  onClick={() => {
                    const errors: Record<string, string> = {};
                    const parsed = profileSchema.safeParse(profile);
                    if (!parsed.success) {
                      for (const issue of parsed.error.issues) {
                        const name = String(issue.path[0]);
                        errors[name] =
                          issue.code === 'too_big'
                            ? t('srm.validation.maxLength', {
                                max: issue.maximum,
                              })
                            : t(`srm.validation.${name}`, {
                                defaultValue: t('srm.invalidField'),
                              });
                      }
                    }
                    for (const name of fields) {
                      if (
                        !['introduction', 'referrerName'].includes(name) &&
                        !profile[name].trim()
                      ) {
                        errors[name] = t('srm.validation.required');
                      }
                    }
                    if (!profile.categories.length)
                      errors.categories = t('srm.validation.categories');
                    if (
                      !profile.attachments.some(
                        (file) => file.kind === 'license',
                      )
                    )
                      errors.attachments = t('srm.validation.attachments');
                    setValidation(errors);
                    setInvalid(Object.keys(errors));
                    setError(undefined);
                    if (Object.keys(errors).length) {
                      const name = Object.keys(errors)[0];
                      document
                        .getElementById(
                          name === 'attachments' ? 'srmFile' : `srm-${name}`,
                        )
                        ?.focus();
                      return;
                    }
                    setConfirm(true);
                  }}
                >
                  {t('srm.submit')}
                </Button>
              </div>
            </>
          ) : (
            <ProfileView
              profile={company.snapshot!}
              supplierNo={company.supplierNo}
              admittedAt={company.admittedAt}
            />
          )}
          {resource.data && <AdmissionHistory detail={resource.data} />}
        </>
      )}
      {leave.dialog}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('srm.confirmSubmit')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('srm.submitHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('srm.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={operation.submitting || submitOperation.submitting}
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {t('srm.submit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
