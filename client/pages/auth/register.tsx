import {
  useAuthentication,
  useSignUpAvailable,
} from '@nocobase/app-plugin-authentication/client';
import {
  useAuthenticationErrorResolver,
  type AuthenticationActionError,
} from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';

import { PasswordRegistrationForm } from '#extensions/nocobase-auth-forms/password-registration-form';

import { Input } from '#components/ui/input';
import { Field, FieldLabel, FieldDescription } from '#components/ui/field';
import { AuthPage } from './shared.js';

export default function RegisterPage(): ReactElement {
  const { t } = useTranslation();
  const [referrerName, setReferrerName] = useState('');
  const { client, refresh } = useAuthentication();
  const navigate = useNavigate();
  const resolveError = useAuthenticationErrorResolver();
  const [error, setError] = useState<AuthenticationActionError>();
  const [submitting, setSubmitting] = useState(false);
  const signUpAvailable = useSignUpAvailable();
  // The page stays so registration can be turned back on; while the server refuses sign-up it only redirects.
  if (!signUpAvailable) return <Navigate replace to='/login' />;

  return (
    <AuthPage
      description={t('srm.registerDescription')}
      title={t('srm.registerTitle')}
    >
      <Field>
        <FieldLabel htmlFor='referrerName'>{t('srm.referrerLabel')}</FieldLabel>
        <Input
          id='referrerName'
          maxLength={100}
          value={referrerName}
          onChange={(event) => setReferrerName(event.target.value)}
        />
        <FieldDescription>{t('srm.referrerHint')}</FieldDescription>
      </Field>
      {error && (
        <p className='text-sm text-muted-foreground'>
          {t('srm.registrationRecovery')}
        </p>
      )}
      <PasswordRegistrationForm
        error={error?.message}
        footer={
          <>
            {t('auth.existingAccount')}{' '}
            <Link to='/login'>{t('auth.signIn')}</Link>
          </>
        }
        labels={{
          confirmPassword: t('auth.confirmPassword'),
          email: t('auth.email'),
          name: t('auth.name'),
          password: t('auth.password'),
          passwordMismatch: t('auth.passwordMismatch'),
          submit: t('auth.createAccount'),
          submitting: t('auth.creatingAccount'),
          username: t('auth.username'),
        }}
        onSubmit={async (values) => {
          const input = { ...values, referrerName: referrerName.trim() };
          setSubmitting(true);
          setError(undefined);
          try {
            // The shared action refreshes before returning and remounts guest pages, losing completion feedback.
            // Keep native sign-up/error handling, but navigate outside the guest guard before refreshing.
            await client.signUp.email(input, { throw: true });
          } catch (cause) {
            setError(resolveError(cause));
            setSubmitting(false);
            return;
          }
          await navigate('/registration-complete', {
            replace: true,
            state: { registered: true },
          });
          await refresh().catch(() => undefined);
        }}
        submitting={submitting}
      />
    </AuthPage>
  );
}
