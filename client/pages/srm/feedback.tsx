import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { Alert, AlertTitle, AlertDescription } from '#components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import type { Company } from './shared.js';
export function Failure({
  error,
  retry,
}: {
  error?: unknown;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();
  const status = error instanceof ApiClientError ? error.status : undefined;
  return (
    <Alert variant='destructive'>
      <AlertCircle />
      <AlertTitle>
        {t(
          status === 403
            ? 'srm.denied'
            : status === 401
              ? 'srm.expired'
              : status === 404
                ? 'srm.notFound'
                : 'srm.failed',
        )}
      </AlertTitle>
      <AlertDescription className='flex flex-col items-start gap-3'>
        {status === 403 && <p>{t('srm.deniedHint')}</p>}
        {status === 401 && (
          <Button
            type='button'
            variant='outline'
            onClick={() => void refresh()}
          >
            {t('srm.signInAgain')}
          </Button>
        )}
        {retry && status !== 403 && status !== 401 && status !== 404 && (
          <Button variant='outline' onClick={retry}>
            {t('srm.retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function StateBadge({ status }: { status: Company['status'] }) {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={
        status === 'approved'
          ? 'success'
          : status === 'pending'
            ? 'info'
            : status === 'rejected'
              ? 'warning'
              : 'neutral'
      }
    >
      {t(`srm.states.${status}`)}
    </StatusBadge>
  );
}
