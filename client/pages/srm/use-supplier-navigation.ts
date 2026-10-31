import { useEffect, useState } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import type { RouteNavigationItem } from '../../routing/route-navigation.js';

/** Supplement generic page grants with the explicit supplier identity, including for root users. */
export function useSupplierNavigation(items: RouteNavigationItem[]) {
  const api = useApiClient();
  const revision = useAuthorizationRevision();
  const { session } = useAuthentication();
  const userId = session?.user.id;
  const [access, setAccess] = useState<{
    userId?: string;
    revision: number;
    allowed: boolean;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    if (userId)
      void api
        .request<{ data: { permissions: Record<string, boolean> } }>({
          path: 'srm/context',
          signal: controller.signal,
        })
        .then(({ data }) => {
          if (!controller.signal.aborted)
            setAccess({
              userId,
              revision,
              allowed: data.permissions.applyAdmission === true,
            });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setAccess({ userId, revision, allowed: false });
        });
    return () => controller.abort();
  }, [api, userId, revision]);
  const allowed =
    access?.userId === userId &&
    access?.revision === revision &&
    access?.allowed;
  return items.filter((item) => item.route.name !== 'srmAdmission' || allowed);
}
