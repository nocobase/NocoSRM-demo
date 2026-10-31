import { Link } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useAuthentication,
  useSignUpAvailable,
} from '@nocobase/app-plugin-authentication/client';
import { Button } from '#components/ui/button';
import { AuthPage } from '../auth/shared.js';

export default function SupplierEntry() {
  const { t } = useTranslation();
  const { session } = useAuthentication();
  const signUpAvailable = useSignUpAvailable();
  return (
    <AuthPage
      title={t('srm.entryTitle')}
      description={t('srm.entryDescription')}
    >
      <div className='space-y-6 text-sm'>
        <section className='space-y-2'>
          <h2 className='text-base font-medium'>{t('srm.entryMaterials')}</h2>
          <p className='text-muted-foreground'>
            {t('srm.entryMaterialsDescription')}
          </p>
        </section>
        <ol className='list-inside list-decimal space-y-2'>
          <li>
            {t(
              signUpAvailable
                ? 'srm.entryStepAccount'
                : 'srm.registrationClosed',
            )}
          </li>
          <li>{t('srm.entryStepSubmit')}</li>
          <li>{t('srm.entryStepReview')}</li>
        </ol>
        <div className='flex flex-wrap gap-3'>
          {session ? (
            <Button nativeButton={false} render={<Link to='/' />}>
              {t('srm.openWorkspace')}
            </Button>
          ) : (
            <>
              {signUpAvailable && (
                <Button nativeButton={false} render={<Link to='/register' />}>
                  {t('srm.registerAndApply')}
                </Button>
              )}
              <Button
                variant='outline'
                nativeButton={false}
                render={<Link to='/login' />}
              >
                {t('srm.supplierLogin')}
              </Button>
            </>
          )}
        </div>
        {!session && (
          <Link
            className='inline-block underline underline-offset-4'
            to='/login?portal=staff'
          >
            {t('srm.staffLogin')}
          </Link>
        )}
      </div>
    </AuthPage>
  );
}
