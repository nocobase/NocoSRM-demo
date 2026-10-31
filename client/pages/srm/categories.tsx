import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useOutletContext } from 'react-router';
import { Failure } from './feedback.js';
import { useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import { useApiClient, useSubmission } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { DataTable } from '#components/data-table';
import { RecordLink } from '#components/record-link';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Checkbox } from '#components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '#components/ui/field';
import { useResource, errorKey, type Category } from './shared.js';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const resource = useResource<Category[]>('srm/categories');
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('srm.categories')}
          description={t('srm.categoriesDescription')}
          actions={
            resource.data && (
              <Button nativeButton={false} render={<Link to='new' />}>
                {t('srm.newCategory')}
              </Button>
            )
          }
        />
        {resource.error ? (
          <Failure error={resource.error} retry={resource.reload} />
        ) : (
          <DataTable
            data={resource.data ?? []}
            loading={resource.loading}
            columns={[
              {
                accessorKey: 'name',
                header: t('srm.nameZh'),
                cell: ({ row }) => (
                  <RecordLink to={row.original.id}>
                    {row.original.name}
                  </RecordLink>
                ),
              },
              { accessorKey: 'nameEn', header: t('srm.nameEn') },
              {
                accessorKey: 'active',
                header: t('srm.status'),
                cell: ({ row }) =>
                  t(row.original.active ? 'srm.active' : 'srm.inactive'),
              },
            ]}
          />
        )}
      </PageContainer>
      <Outlet context={{ reload: resource.reload }} />
    </>
  );
}
export function CategoryForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const resource = useResource<Category[]>('srm/categories');
  const original = resource.data?.find((c) => c.id === id);
  if (resource.error)
    return (
      <RouteDialog title={t('srm.category')}>
        <Failure error={resource.error} retry={resource.reload} />
      </RouteDialog>
    );
  if (resource.data && id && !original)
    return (
      <RouteDialog title={t('srm.category')}>
        <p role='alert'>{t('srm.categoryNotFound')}</p>
      </RouteDialog>
    );
  if (!resource.data)
    return (
      <RouteDialog title={t('srm.category')}>
        <p>{t('srm.loading')}</p>
      </RouteDialog>
    );
  return <LoadedCategoryForm key={id || 'new'} original={original} />;
}
function LoadedCategoryForm({ original }: { original?: Category }) {
  const { t } = useTranslation();
  const api = useApiClient();
  const { session } = useAuthentication();
  const navigate = useNavigate();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const [name, setName] = useState(original?.name ?? '');
  const [nameEn, setNameEn] = useState(original?.nameEn ?? '');
  const [active, setActive] = useState(original?.active ?? true);
  const [error, setError] = useState<unknown>();
  const submission = useSubmission({
    scope: `${session?.user.id}:srm.category:${original?.id ?? 'new'}`,
  });
  const save = async () => {
    try {
      const result = await submission.run(
        {
          ...(original ? { id: original.id } : {}),
          name,
          nameEn,
          active,
          revision: original?.revision ?? 0,
        },
        (key, signal, input) =>
          api.request({
            path: 'srm/categories',
            method: 'POST',
            json: input,
            signal,
            headers: { 'Idempotency-Key': key },
          }),
      );
      if (result) {
        reload();
        void navigate('..');
      }
    } catch (e) {
      setError(e);
    }
  };
  return (
    <RouteDialog
      title={t(original ? 'srm.editCategory' : 'srm.newCategory')}
      footer={
        <Button
          disabled={submission.submitting || !name.trim() || !nameEn.trim()}
          onClick={() => void save()}
        >
          {t('srm.save')}
        </Button>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor='categoryName'>{t('srm.nameZh')} *</FieldLabel>
          <Input
            id='categoryName'
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='categoryNameEn'>{t('srm.nameEn')} *</FieldLabel>
          <Input
            id='categoryNameEn'
            value={nameEn}
            maxLength={100}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </Field>
        <Field orientation='horizontal'>
          <Checkbox
            id='categoryActive'
            checked={active}
            onCheckedChange={(value) => setActive(!!value)}
          />
          <FieldLabel htmlFor='categoryActive'>{t('srm.active')}</FieldLabel>
        </Field>
        {!!error && (
          <p role='alert'>
            {t(errorKey(error), { defaultValue: t('srm.failed') })}
          </p>
        )}
      </FieldGroup>
    </RouteDialog>
  );
}
