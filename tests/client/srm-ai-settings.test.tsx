import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
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
import {
  AiReviewSettings,
  type AiSettingsResponse,
} from '../../client/pages/srm/ai-settings.js';
import { useResource } from '../../client/pages/srm/shared.js';
import { defaultAiSettings } from '../../server/srm/ai-schema.js';
import enUS from '../../client/locales/en-US.js';
import packageMetadata from '../../package.json' with { type: 'json' };

afterEach(cleanup);
let identity = 0;
const model = { modelService: 'review-service', model: 'deepseek-flash' };
const configured: AiSettingsResponse = {
  settings: defaultAiSettings,
  canConfigure: true,
  canManageModels: true,
  models: [{ label: 'Review model', value: model }],
};
function Page() {
  const resource = useResource<AiSettingsResponse>('srm/aiReview/settings');
  return <AiReviewSettings resource={resource} />;
}
async function renderSettings(
  data = configured,
  callback?: (call: ApiCall) => unknown,
) {
  const userId = `ai-admin-${++identity}`;
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/' element={<Page />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/',
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi((call) => callback?.(call) ?? { data }),
      services: (app) => {
        app.container.instance(authenticationClientToken, {
          getSession: async () => ({
            data: {
              session: { id: 'session', userId },
              user: {
                id: userId,
                name: 'Synthetic administrator',
                email: 'synthetic@example.test',
              },
            },
          }),
        });
      },
    },
  );
}
it('saves validated settings using the same input and shows success', async () => {
  const update = vi.fn();
  await renderSettings(
    { ...configured, settings: { ...defaultAiSettings, model } },
    (call) => {
      if (call.method === 'PUT') {
        update(call);
        return {
          data: {
            enabled: true,
            model,
            threshold: 0.86,
            maxOutputTokens: 1024,
          },
        };
      }
    },
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('checkbox', { name: 'Enable AI review' }),
  );
  await user.type(
    screen.getByRole('spinbutton', { name: /Confidence threshold/ }),
    '0.86',
  );
  await user.click(screen.getByRole('button', { name: enUS.srm.ai.save }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(
    await screen.findByText('AI review settings saved'),
  ).toBeInTheDocument();
});
it('does not send an incomplete enabled configuration and keeps the draft', async () => {
  const update = vi.fn();
  await renderSettings(configured, (call) => {
    if (call.method === 'PUT') update(call);
  });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('checkbox', { name: 'Enable AI review' }),
  );
  await user.click(screen.getByRole('button', { name: enUS.srm.ai.save }));
  expect(
    await screen.findByText('Enter a calibrated threshold between 0 and 1.'),
  ).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox')).toBeChecked();
});
it('shows read-only settings without management or save actions', async () => {
  await renderSettings({
    ...configured,
    canConfigure: false,
    canManageModels: false,
  });
  const checkbox = await screen.findByRole('checkbox');
  expect(checkbox).toHaveAttribute('aria-disabled', 'true');
  await userEvent.setup().click(checkbox);
  expect(checkbox).not.toBeChecked();
  expect(
    screen.queryByRole('button', { name: enUS.srm.ai.save }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Models' }),
  ).not.toBeInTheDocument();
});
it('shows the empty model state and authorized Models link', async () => {
  await renderSettings({ ...configured, models: [] });
  expect(
    await screen.findByText('No chat models configured'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute(
    'href',
    '/settings/models',
  );
});

for (const status of [401, 403, 404, 500]) {
  it(`shows the ${status} read failure with appropriate retry access`, async () => {
    await renderSettings(
      configured,
      () =>
        new Response(
          JSON.stringify({ error: { message: 'Synthetic failure' } }),
          { status },
        ),
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const retry = screen.queryByRole('button', { name: enUS.srm.retry });
    if (status === 401)
      expect(
        screen.getByRole('button', { name: enUS.srm.signInAgain }),
      ).toBeInTheDocument();
    if (status === 403)
      expect(screen.getByText(enUS.srm.deniedHint)).toBeInTheDocument();
    if (status === 500) expect(retry).toBeInTheDocument();
    else expect(retry).not.toBeInTheDocument();
  });
}
it('preserves input and shows feedback when saving fails', async () => {
  await renderSettings(configured, (call) =>
    call.method === 'PUT'
      ? new Response(
          JSON.stringify({ error: { message: 'Synthetic failure' } }),
          { status: 500 },
        )
      : undefined,
  );
  const user = userEvent.setup();
  const threshold = await screen.findByRole('spinbutton', {
    name: /Confidence threshold/,
  });
  await user.type(threshold, '0.85');
  await user.click(screen.getByRole('button', { name: enUS.srm.ai.save }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(threshold).toHaveValue(0.85);
  expect(screen.getByRole('button', { name: enUS.srm.ai.save })).toBeEnabled();
});

it('keeps invalid field errors until their values are corrected', async () => {
  await renderSettings({
    ...configured,
    settings: { ...defaultAiSettings, enabled: true, threshold: 0.8, model },
  });
  const user = userEvent.setup();
  const threshold = await screen.findByRole('spinbutton', {
    name: /Confidence threshold/,
  });
  const tokens = screen.getByRole('spinbutton', {
    name: /Maximum output tokens/,
  });
  await user.clear(threshold);
  await user.type(threshold, '2');
  await user.clear(tokens);
  await user.type(tokens, '127');
  await user.click(screen.getByRole('button', { name: enUS.srm.ai.save }));
  expect(threshold).toHaveAttribute('aria-invalid', 'true');
  await user.clear(threshold);
  await user.type(threshold, '3');
  expect(threshold).toHaveAttribute('aria-invalid', 'true');
  await user.clear(tokens);
  await user.type(tokens, '126');
  expect(tokens).toHaveAttribute('aria-invalid', 'true');
  await user.clear(threshold);
  await user.type(threshold, '0.8');
  expect(threshold).toHaveAttribute('aria-invalid', 'false');
  await user.clear(tokens);
  await user.type(tokens, '1024');
  expect(tokens).toHaveAttribute('aria-invalid', 'false');
});
