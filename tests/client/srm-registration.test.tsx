import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import {
  AuthenticationProvider,
  GuestAuthentication,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import { renderWithApp } from '@nocobase/app-testing/client';
import RegisterPage from '../../client/pages/auth/register.js';
import RegistrationComplete from '../../client/pages/auth/registration-complete.js';
import enUS from '../../client/locales/en-US.js';
import metadata from '../../package.json' with { type: 'json' };

afterEach(cleanup);

async function renderRegistration(
  signUp: ReturnType<typeof vi.fn>,
  refreshSession = vi.fn(async () => ({ data: null })),
) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route
          path='/register'
          element={
            <GuestAuthentication>
              <RegisterPage />
            </GuestAuthentication>
          }
        />
        <Route
          path='/registration-complete'
          element={<RegistrationComplete />}
        />
        <Route path='/login' element={<p>Supplier login destination</p>} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/register',
      namespace: metadata.name,
      namespaces: {
        [metadata.name]: enUS,
        '@nocobase/app-plugin-authentication': {
          errors: {
            network: 'Network unavailable',
            generic: 'Registration failed',
          },
        },
      },
      services: (app) => {
        app.container.instance(authenticationClientToken, {
          getSession: refreshSession,
          signUp: { email: signUp },
        });
      },
    },
  );
}
async function fillAndSubmit() {
  await screen.findByLabelText('Name');
  for (const [label, value] of [
    ['Name', 'Applicant'],
    ['Username', 'applicant'],
    ['Email', 'applicant@example.test'],
    ['Password', 'Test-password-123!'],
    ['Confirm password', 'Test-password-123!'],
  ]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
}
it('keeps completion visible across the native session refresh and offers supplier login', async () => {
  let finishRefresh!: (value: { data: null }) => void;
  const refreshSession = vi
    .fn()
    .mockResolvedValueOnce({ data: null })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
  const signUp = vi.fn().mockResolvedValue({
    data: { user: { id: 'new-applicant' }, token: null },
  });
  await renderRegistration(signUp, refreshSession);
  await fillAndSubmit();
  expect(
    await screen.findByRole('heading', { name: 'Account created' }),
  ).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Registration complete');
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Continue to supplier sign in' }),
  ).toHaveAttribute('aria-disabled', 'true');
  finishRefresh({ data: null });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Continue to supplier sign in' }),
    ).not.toHaveAttribute('aria-disabled', 'true'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue to supplier sign in' }),
  );
  expect(await screen.findByText('Supplier login destination')).toBeVisible();
  expect(signUp).toHaveBeenCalledTimes(1);
});
it('preserves entered values after failed registration and can retry successfully', async () => {
  const signUp = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Network unavailable'))
    .mockResolvedValueOnce({ data: { user: { id: 'retry-applicant' } } });
  await renderRegistration(signUp);
  await fillAndSubmit();
  await waitFor(() =>
    expect(document.querySelector('button[type=submit]')).not.toBeDisabled(),
  );
  expect(screen.getByLabelText('Email')).toHaveValue('applicant@example.test');
  expect(screen.getByLabelText('Password')).toHaveValue('Test-password-123!');
  expect(
    screen.queryByRole('heading', { name: 'Account created' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
  expect(
    await screen.findByRole('heading', { name: 'Account created' }),
  ).toBeVisible();
  expect(signUp).toHaveBeenCalledTimes(2);
});
