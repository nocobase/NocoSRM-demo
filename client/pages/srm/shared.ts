import { z } from 'zod';
import { useApiClient, ApiClientError } from '@nocobase/app-client';
import { useLocale } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState } from 'react';
import type {
  RunView,
  TaskActions,
} from '@nocobase/app-plugin-approval/client';
import type { Profile } from '../../../server/srm/schema.js';

export type { Profile };
export interface Company {
  id: string;
  ownerId: string;
  status: 'draft' | 'pending' | 'rejected' | 'approved';
  draft: Profile;
  snapshot: Profile | null;
  creditCode: string | null;
  supplierNo: string | null;
  lifecycleVersion: number;
  submissionVersion: number;
  submittedAt: string | null;
  admittedAt: string | null;
}
export interface Category {
  id: string;
  name: string;
  nameEn: string;
  active: boolean;
  revision: number;
}
export interface Detail {
  company: Company;
  versions: {
    id: string;
    version: number;
    snapshot: Profile;
    submittedAt: string;
  }[];
  runs: RunView[];
  actions: TaskActions[];
  people?: Record<string, string>;
}
export function useResource<T>(path: string, refreshKey?: number) {
  const api = useApiClient();
  const [data, setData] = useState<T>();
  const [meta, setMeta] = useState<{
    total: number;
    page: number;
    pageSize: number;
  }>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [previousPath, setPreviousPath] = useState(path);
  if (previousPath !== path) {
    setPreviousPath(path);
    setData(undefined);
    setError(undefined);
    setLoading(true);
  }
  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{
        data: T;
        meta?: { total: number; page: number; pageSize: number };
      }>({ path, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result.data);
          setMeta(result.meta);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, path, revision, refreshKey]);
  return { data, setData, meta, error, loading, reload };
}
export function useDate() {
  const { locale } = useLocale();
  return (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : '—';
}
export const emptyProfile: Profile = {
  legalName: '',
  creditCode: '',
  address: '',
  introduction: '',
  categories: [],
  products: '',
  contactName: '',
  phone: '',
  contactEmail: '',
  referrerName: '',
  attachments: [],
};
export function errorKey(error: unknown): string {
  return error instanceof ApiClientError
    ? `srm.errors.${error.reason}`
    : 'srm.failed';
}

export function invalidFields(error: unknown): string[] {
  if (!(error instanceof ApiClientError)) return [];
  const parsed = z
    .object({
      error: z.object({
        fieldViolations: z.array(z.object({ field: z.string() })),
      }),
    })
    .safeParse(error.payload);
  return parsed.success
    ? parsed.data.error.fieldViolations.map((v) =>
        v.field.replace(/^profile\./, ''),
      )
    : [];
}

export function useCategoryName() {
  const { locale } = useLocale();
  return (category: Category) =>
    locale.startsWith('zh') ? category.name : category.nameEn;
}
