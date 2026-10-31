import { apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import AdmissionPage from '../../client/pages/srm/admission.js';
import SrmHome from '../../client/pages/srm/home.js';
import enUS from '../../client/locales/en-US.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { emptyProfile } from '../../client/pages/srm/shared.js';

afterEach(cleanup);
let identity = 0;

async function renderPage(
  page: 'admission' | 'home',
  handler: (call: ApiCall) => unknown,
) {
  const userId = `supplier-${++identity}`;
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route
          path='/'
          element={page === 'admission' ? <AdmissionPage /> : <SrmHome />}
        />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/',
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(handler),
      services: (app) => {
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
        app.container.instance(authenticationClientToken, {
          getSession: async () => ({
            data: {
              session: { id: 'session', userId },
              user: {
                id: userId,
                name: 'Supplier',
                email: 'supplier@example.test',
                referrerName: 'Sales introducer',
              },
            },
          }),
        });
      },
    },
  );
}
it('shows a frozen submitted profile without edit or submit actions', async () => {
  await renderPage('admission', ({ path }) =>
    path === 'srm/categories'
      ? { data: [] }
      : {
          data: {
            company: {
              id: 'company',
              status: 'pending',
              lifecycleVersion: 3,
              submissionVersion: 1,
              draft: emptyProfile,
              snapshot: { ...emptyProfile, legalName: 'Frozen company' },
            },
            versions: [],
            runs: [],
            actions: [],
          },
        },
  );
  expect((await screen.findAllByText('Frozen company'))[0]).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save draft' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Submit application' }),
  ).not.toBeInTheDocument();
});
it('shows procurement entries only for the capabilities returned by the server', async () => {
  const handler = vi.fn(() => ({
    data: {
      permissions: {
        applyAdmission: true,
        readApplications: false,
        readSuppliers: false,
      },
      company: null,
    },
  }));
  await renderPage('home', handler);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open admission' }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole('button', { name: 'Review applications' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Browse suppliers' }),
  ).not.toBeInTheDocument();
});

it('lets a rejected supplier remove an inactive selected category before resubmitting', async () => {
  await renderPage('admission', ({ path }) =>
    path === 'srm/categories'
      ? {
          data: [
            {
              id: 'inactive-category',
              name: '停用品类',
              nameEn: 'Inactive category',
              active: false,
              revision: 1,
            },
          ],
        }
      : {
          data: {
            company: {
              id: 'company',
              status: 'rejected',
              lifecycleVersion: 4,
              submissionVersion: 1,
              draft: { ...emptyProfile, categories: ['inactive-category'] },
              snapshot: emptyProfile,
            },
            versions: [],
            runs: [],
            actions: [],
          },
        },
  );
  const selected = await screen.findByRole('checkbox', {
    name: /Inactive category/,
  });
  expect(selected).not.toBeDisabled();
  await userEvent.click(selected);
  expect(
    screen.queryByRole('checkbox', { name: /Inactive category/ }),
  ).not.toBeInTheDocument();
});

it('hides supplier admission for internal staff', async () => {
  await renderPage('home', () => ({
    data: {
      permissions: {
        applyAdmission: false,
        readApplications: true,
        readSuppliers: true,
      },
    },
  }));
  expect(
    await screen.findByRole('button', { name: 'Review applications' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open admission' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Internal workspace' }),
  ).toBeInTheDocument();
});

it.each([false, true])(
  'saves the current form before submitting (save fails: %s)',
  async (saveFails) => {
    const writes: ApiCall[] = [];
    await renderPage('admission', (call) => {
      if (call.method === 'GET')
        return {
          data:
            call.path === 'srm/categories'
              ? []
              : {
                  company: {
                    id: 'company',
                    status: 'rejected',
                    lifecycleVersion: 6,
                    submissionVersion: 1,
                    draft: {
                      ...emptyProfile,
                      legalName: '',
                      creditCode: '91350211M000100Y43',
                      address: 'Test address',
                      products: 'Parts',
                      contactName: 'Contact',
                      phone: '123456789',
                      contactEmail: 'contact@example.com',
                      categories: ['00000000-0000-4000-8000-000000000001'],
                      attachments: [
                        {
                          id: '00000000-0000-4000-8000-000000000002',
                          kind: 'license',
                          name: 'License',
                        },
                      ],
                    },
                  },
                  versions: [],
                  runs: [],
                  actions: [],
                },
        };
      writes.push(call);
      if (call.path === 'srm/profile') {
        if (saveFails)
          return new Response(
            JSON.stringify({
              error: { reason: 'INVALID_INPUT', message: 'Save failed' },
            }),
            { status: 500 },
          );
        return {
          data: {
            id: 'company',
            status: 'draft',
            lifecycleVersion: 7,
            submissionVersion: 0,
            draft: {
              ...emptyProfile,
              legalName: 'Latest company',
              referrerName: 'Sales introducer',
            },
          },
        };
      }
      return { data: null };
    });
    const field = await screen.findByLabelText(/Legal company name/);
    await userEvent.type(field, 'Latest company');
    const declaration = screen.getByRole('checkbox', { name: /I confirm/ });
    const submit = screen.getByRole('button', { name: 'Submit application' });
    expect(submit).toBeDisabled();
    await userEvent.click(declaration);
    expect(submit).toBeEnabled();
    expect(
      declaration.compareDocumentPosition(submit) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(submit);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Submit application' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(writes.map((call) => call.path)).toEqual(
      saveFails ? ['srm/profile'] : ['srm/profile', 'srm/submit'],
    );
    expect(writes[0].json).toMatchObject({
      profile: { legalName: 'Latest company' },
    });
    if (saveFails) {
      expect(field).toHaveValue('Latest company');
      expect(screen.getByRole('alert')).toBeInTheDocument();
    } else {
      expect(writes[1].json).toMatchObject({
        expectedVersion: 7,
        declaration: true,
      });
    }
  },
);

it('explains invalid credit codes and missing required fields before sending data', async () => {
  const writes: ApiCall[] = [];
  await renderPage('admission', (call) => {
    if (call.method !== 'GET') writes.push(call);
    return { data: call.path === 'srm/categories' ? [] : null };
  });
  const creditCode = await screen.findByLabelText(/Unified social credit code/);
  await userEvent.type(creditCode, 'Test');
  await userEvent.click(screen.getByRole('checkbox', { name: /I confirm/ }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit application' }),
  );
  expect(
    screen.getByText(/Enter the 18-character unified social credit code/),
  ).toBeInTheDocument();
  expect(creditCode).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(
    0,
  );
  expect(
    screen.getByText('Select at least one supply category.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Upload a business license (PDF, JPG or PNG).'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(writes).toHaveLength(0);
});

it('submits a new supplier without a separate save step', async () => {
  const writes: ApiCall[] = [];
  const categoryId = '00000000-0000-4000-8000-000000000001';
  await renderPage('admission', (call) => {
    if (call.method === 'GET')
      return {
        data:
          call.path === 'srm/categories'
            ? [{ id: categoryId, name: '零件', nameEn: 'Parts', active: true }]
            : null,
      };
    writes.push(call);
    if (call.path === 'srm/files')
      return {
        data: {
          id: '00000000-0000-4000-8000-000000000002',
          filename: 'license.pdf',
        },
      };
    if (call.path === 'srm/profile')
      return {
        data: {
          id: 'company',
          status: 'draft',
          lifecycleVersion: 1,
          submissionVersion: 0,
          draft: (call.json as { profile: unknown }).profile,
        },
      };
    return { data: null };
  });
  await screen.findByLabelText(/Legal company name/);
  for (const [label, value] of [
    ['Legal company name', 'New company'],
    ['Unified social credit code', '91350211M000100Y43'],
    ['Registered address', 'Test address'],
    ['Main products or services', 'Parts'],
    ['Contact name', 'Contact'],
    ['Contact phone', 'invalid'],
    ['Business contact email', 'invalid'],
  ])
    await userEvent.type(screen.getByLabelText(new RegExp(label!)), value!);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Parts' }));
  await userEvent.upload(
    screen.getByLabelText('Upload qualification'),
    new File(['license'], 'license.pdf', { type: 'application/pdf' }),
  );
  await userEvent.click(screen.getByRole('checkbox', { name: /I confirm/ }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit application' }),
  );
  expect(screen.getByText(/Enter 7–30 characters/)).toBeInTheDocument();
  expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
  for (const [label, value] of [
    ['Contact phone', '123456789'],
    ['Business contact email', 'contact@example.com'],
  ]) {
    const input = screen.getByLabelText(new RegExp(label!));
    await userEvent.clear(input);
    await userEvent.type(input, value!);
  }
  await userEvent.click(
    screen.getByRole('button', { name: 'Submit application' }),
  );
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Submit application' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
  expect(writes.map((call) => call.path)).toEqual([
    'srm/files',
    'srm/profile',
    'srm/submit',
  ]);
  expect(writes[2].json).toMatchObject({
    expectedVersion: 1,
    declaration: true,
  });
});
