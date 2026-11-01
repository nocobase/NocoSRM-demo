import { useCategoryName } from './shared.js';
import { DateFilter } from './date-filter.js';
import { Failure, StateBadge } from './feedback.js';
import { useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { DataTable } from '#components/data-table';
import { Input } from '#components/ui/input';
import { Button } from '#components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import { useResource, useDate, type Company, type Category } from './shared.js';

export default function AdmissionList() {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const location = useLocation();
  const suppliers = location.pathname.startsWith('/suppliers');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const date = useDate();
  const path = `srm/${suppliers ? 'suppliers' : 'applications'}?${params.toString()}`;
  const resource = useResource<Company[]>(path);
  const categories = useResource<Category[]>('srm/categories');
  const rows = resource.data ?? [];
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const columns: ColumnDef<Company>[] = [
    {
      id: 'legalName',
      header: t('srm.fields.legalName'),
      accessorFn: (row) => row.snapshot?.legalName,
      cell: ({ row }) => (
        <RecordLink
          to={{ pathname: `${row.original.id}`, search: location.search }}
        >
          {row.original.snapshot?.legalName}
        </RecordLink>
      ),
    },
    ...(suppliers
      ? [
          {
            accessorKey: 'supplierNo',
            header: t('srm.supplierNo'),
          } as ColumnDef<Company>,
        ]
      : []),
    { accessorKey: 'creditCode', header: t('srm.fields.creditCode') },
    {
      accessorKey: 'status',
      header: t('srm.status'),
      cell: ({ row }) => <StateBadge status={row.original.status} />,
    },
    {
      id: 'categories',
      header: t('srm.fields.categories'),
      cell: ({ row }) =>
        row.original.snapshot?.categories
          .map((id) =>
            ((category) => (category ? categoryName(category) : id))(
              categories.data?.find((c) => c.id === id),
            ),
          )
          .join(', '),
    },
    {
      id: 'referrer',
      header: t('srm.fields.referrerName'),
      accessorFn: (row) => row.snapshot?.referrerName || '—',
    },
    {
      accessorKey: suppliers ? 'admittedAt' : 'submittedAt',
      header: t(suppliers ? 'srm.admittedAt' : 'srm.submittedAt'),
      cell: ({ row }) =>
        date(suppliers ? row.original.admittedAt : row.original.submittedAt),
    },
  ];
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t(suppliers ? 'srm.suppliers' : 'srm.applications')}
          description={t(
            suppliers
              ? 'srm.suppliersDescription'
              : 'srm.applicationsDescription',
          )}
          actions={
            <Button
              aria-label={t('srm.refresh')}
              variant='outline'
              size='icon'
              disabled={resource.loading}
              onClick={resource.reload}
            >
              <RefreshCw className={resource.loading ? 'animate-spin' : ''} />
            </Button>
          }
        />
        <div className='flex flex-wrap items-center gap-2'>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update('q', search);
            }}
            className='flex gap-2'
          >
            <Input
              className='sm:max-w-xs'
              aria-label={t('srm.search')}
              placeholder={t('srm.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant='outline' type='submit'>
              {t('srm.searchButton')}
            </Button>
          </form>
          {!suppliers && (
            <Select
              items={{
                all: t('srm.allStatuses'),
                pending: t('srm.states.pending'),
                rejected: t('srm.states.rejected'),
                approved: t('srm.states.approved'),
              }}
              value={params.get('status') || 'all'}
              onValueChange={(value) =>
                update('status', value === 'all' ? '' : String(value))
              }
            >
              <SelectTrigger aria-label={t('srm.status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {['all', 'pending', 'rejected', 'approved'].map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(
                        status === 'all'
                          ? 'srm.allStatuses'
                          : `srm.states.${status}`,
                      )}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Select
            items={Object.fromEntries([
              ['all', t('srm.allCategories')] as const,
              ...(categories.data ?? []).map(
                (cat) => [cat.id, categoryName(cat)] as const,
              ),
            ])}
            value={params.get('category') || 'all'}
            onValueChange={(value) =>
              update('category', value === 'all' ? '' : String(value))
            }
          >
            <SelectTrigger aria-label={t('srm.fields.categories')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='all'>{t('srm.allCategories')}</SelectItem>
                {categories.data?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {categoryName(cat)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <DateFilter
            from={params.get('from')}
            to={params.get('to')}
            onChange={(from, to) => {
              const next = new URLSearchParams(params);
              if (from && to) {
                next.set('from', from);
                next.set('to', to);
              } else {
                next.delete('from');
                next.delete('to');
              }
              next.delete('page');
              setParams(next);
            }}
          />
          {params.size > 0 && (
            <Button
              variant='ghost'
              onClick={() => {
                setSearch('');
                setParams({});
              }}
            >
              {t('srm.clear')}
            </Button>
          )}
        </div>
        {resource.error ? (
          <Failure error={resource.error} retry={resource.reload} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            manualPagination
            rowCount={resource.meta?.total ?? 0}
            paginationState={{
              pageIndex: Number(params.get('page') ?? 1) - 1,
              pageSize: Number(params.get('pageSize') ?? 20),
            }}
            onPaginationChange={(updatePage) => {
              const current = {
                pageIndex: Number(params.get('page') ?? 1) - 1,
                pageSize: Number(params.get('pageSize') ?? 20),
              };
              const nextPage =
                typeof updatePage === 'function'
                  ? updatePage(current)
                  : updatePage;
              const next = new URLSearchParams(params);
              next.set('page', String(nextPage.pageIndex + 1));
              next.set('pageSize', String(nextPage.pageSize));
              setParams(next);
            }}
            loading={resource.loading}
            emptyMessage={t(params.size ? 'srm.noResults' : 'srm.empty')}
          />
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
