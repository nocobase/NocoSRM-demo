import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { Failure, StateBadge } from './feedback.js';
import { Link } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Building2, ClipboardCheck, BookOpen } from 'lucide-react';
import { useResource, type Company } from './shared.js';

export default function SrmHome() {
  const { t } = useTranslation();
  const authorizationRevision = useAuthorizationRevision();
  const context = useResource<{
    permissions: Record<string, boolean>;
    company?: Company;
  }>('srm/context', authorizationRevision);
  return (
    <PageContainer>
      <PageHeader
        title={t(
          context.data?.permissions.applyAdmission
            ? 'srm.supplierWorkspace'
            : 'srm.staffWorkspace',
        )}
        description={t('srm.workspaceDescription')}
      />
      {context.error ? (
        <Failure error={context.error} retry={context.reload} />
      ) : !context.data ? (
        <p>{t('srm.loading')}</p>
      ) : (
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {context.data.permissions.applyAdmission && (
            <Card>
              <CardHeader>
                <Building2 className='size-5 text-primary' />
                <CardTitle>{t('srm.admission')}</CardTitle>
                <CardDescription>
                  {t('srm.admissionDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col items-start gap-4'>
                {context.data.company && (
                  <StateBadge status={context.data.company.status} />
                )}
                <Button nativeButton={false} render={<Link to='/admission' />}>
                  {t('srm.openAdmission')}
                </Button>
              </CardContent>
            </Card>
          )}
          {!Object.values(context.data.permissions).some(Boolean) && (
            <p className='text-sm text-muted-foreground'>
              {t('srm.noWorkspace')}
            </p>
          )}
          {context.data.permissions.readApplications && (
            <Card>
              <CardHeader>
                <ClipboardCheck className='size-5 text-primary' />
                <CardTitle>{t('srm.applications')}</CardTitle>
                <CardDescription>
                  {t('srm.applicationsDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant='outline'
                  nativeButton={false}
                  render={<Link to='/applications' />}
                >
                  {t('srm.openApplications')}
                </Button>
              </CardContent>
            </Card>
          )}
          {context.data.permissions.readSuppliers && (
            <Card>
              <CardHeader>
                <BookOpen className='size-5 text-primary' />
                <CardTitle>{t('srm.suppliers')}</CardTitle>
                <CardDescription>
                  {t('srm.suppliersDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant='outline'
                  nativeButton={false}
                  render={<Link to='/suppliers' />}
                >
                  {t('srm.openSuppliers')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}
