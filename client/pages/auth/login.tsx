import {
  usePasswordResetCapability,
  useSignUpAvailable,
} from '@nocobase/app-plugin-authentication/client';
import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import { Building2, BriefcaseBusiness } from 'lucide-react';
import { Button } from '#components/ui/button';
import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { PasswordLoginForm } from '#extensions/nocobase-auth-forms/password-login-form';
import { AuthMethods } from '#extensions/nocobase-auth-methods/auth-methods';

import { AuthPage } from './shared.js';

export default function LoginPage(): ReactElement {
  const { t } = useTranslation();
  const login = usePasswordLogin();
  const [params] = useSearchParams();
  const staff = params.get('portal') === 'staff';
  const entryUrl = (employee: boolean) => {
    const query = new URLSearchParams(params);
    if (employee) query.set('portal', 'staff');
    else query.delete('portal');
    return `/login${query.size ? `?${query}` : ''}`;
  };
  // The sign-up link follows the server: it is hidden while `auth.emailAndPassword` turns sign-up off.
  const signUpAvailable = useSignUpAvailable();
  const resetCapability = usePasswordResetCapability();

  return (
    <AuthPage
      className='auth-login-page'
      description={t(
        staff ? 'srm.staffLoginDescription' : 'srm.supplierLoginDescription',
      )}
      title={t(staff ? 'srm.staffLogin' : 'srm.supplierLogin')}
    >
      <nav
        className='grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1'
        aria-label={t('srm.loginEntry')}
      >
        <Button
          className='w-full'
          size='lg'
          variant={!staff ? 'default' : 'ghost'}
          nativeButton={false}
          role='link'
          render={
            <Link
              to={entryUrl(false)}
              aria-current={!staff ? 'page' : undefined}
            />
          }
        >
          <Building2 aria-hidden='true' />
          {t('srm.supplierLogin')}
        </Button>
        <Button
          className='w-full'
          size='lg'
          variant={staff ? 'default' : 'ghost'}
          nativeButton={false}
          role='link'
          render={
            <Link
              to={entryUrl(true)}
              aria-current={staff ? 'page' : undefined}
            />
          }
        >
          <BriefcaseBusiness aria-hidden='true' />
          {t('srm.staffLogin')}
        </Button>
      </nav>
      {/* Add another sign-in method to `methods`, or SSO buttons as `providers`; the guest route redirects once
          the session exists. */}
      <AuthMethods
        labels={{
          continueWith: t('auth.continueWith'),
          methods: t('auth.methods'),
          separator: t('auth.or'),
        }}
        methods={[
          {
            content: (
              <PasswordLoginForm
                error={login.error?.message}
                footer={
                  signUpAvailable && !staff ? (
                    <>
                      {t('auth.noAccount')}{' '}
                      <Link to='/register'>{t('auth.signUp')}</Link>
                    </>
                  ) : undefined
                }
                forgotPasswordLink={
                  resetCapability.data?.passwordResetAvailable === true ? (
                    <Link to='/forgot-password'>{t('auth.forgotLink')}</Link>
                  ) : undefined
                }
                labels={{
                  hidePassword: t('auth.hidePassword'),
                  identifier: t('auth.identifier'),
                  password: t('auth.password'),
                  showPassword: t('auth.showPassword'),
                  submit: t('auth.signIn'),
                  submitting: t('auth.signingIn'),
                }}
                onSubmit={login.submit}
                submitting={login.isPending}
              />
            ),
            id: 'password',
            label: t('auth.password'),
          },
        ]}
      />
      <Link
        className='text-center text-sm text-muted-foreground underline underline-offset-4'
        to='/supplier'
      >
        {t('srm.entryTitle')}
      </Link>
    </AuthPage>
  );
}
