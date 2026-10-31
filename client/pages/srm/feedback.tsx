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
  const status = error instanceof ApiClientError ? error.status : undefined;
  return (
    <div role='alert' className='flex flex-col gap-3'>
      <p className='text-sm text-destructive'>
        {t(
          status === 403
            ? 'srm.denied'
            : status === 401
              ? 'srm.expired'
              : 'srm.failed',
        )}
      </p>
      {retry && status !== 403 && status !== 401 && (
        <Button variant='outline' onClick={retry}>
          {t('srm.retry')}
        </Button>
      )}
    </div>
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
