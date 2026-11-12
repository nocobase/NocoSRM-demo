import { Info } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Button } from '#components/ui/button';
import { AuthPage } from './shared.js';

/**
 * This optional route survives session refresh, unlike the guest registration form.
 * Sign-up answers a taken email with the same success response, so the copy stays neutral and never claims an account.
 */
export default function RegistrationComplete() {
  const { t } = useTranslation();
  const { session, isPending } = useAuthentication();
  const location = useLocation();
  if (!(location.state as { registered?: boolean } | null)?.registered)
    return <Navigate replace to='/supplier' />;
  return (
    <AuthPage
      title={t('srm.registrationComplete')}
      description={t('srm.registrationNextStep')}
    >
      <div className='space-y-6'>
        <div
          className='flex items-center gap-3 rounded-lg border border-border bg-muted p-4'
          role='status'
        >
          <Info aria-hidden='true' className='size-6 shrink-0 text-primary' />
          <p className='text-sm font-medium'>{t('srm.registered')}</p>
        </div>
        <Button
          className='w-full'
          nativeButton={false}
          disabled={isPending}
          render={<Link to={session ? '/' : '/login'} />}
        >
          {t(session ? 'srm.openWorkspace' : 'srm.continueToLogin')}
        </Button>
      </div>
    </AuthPage>
  );
}
