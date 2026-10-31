import { z } from 'zod';

const text = (length: number) => z.string().trim().max(length);
export const profileSchema = z.object({
  legalName: text(200).default(''),
  creditCode: text(18)
    .transform((s) => s.toUpperCase())
    .refine(
      (s) => !s || /^[0-9A-HJ-NPQRTUWXY]{18}$/.test(s),
      'Invalid credit code',
    )
    .default(''),
  address: text(500).default(''),
  introduction: text(4000).default(''),
  categories: z.array(z.string().uuid()).max(50).default([]),
  products: text(2000).default(''),
  contactName: text(100).default(''),
  phone: text(30)
    .refine((s) => !s || /^\+?[\d() -]{7,30}$/.test(s), 'Invalid phone')
    .default(''),
  contactEmail: text(254)
    .refine((s) => !s || z.email().safeParse(s).success, 'Invalid email')
    .default(''),
  referrerName: text(100).default(''),
  attachments: z
    .array(
      z.object({
        id: z.string().uuid(),
        kind: z.enum(['license', 'other']),
        name: text(100).min(1),
      }),
    )
    .max(10)
    .default([]),
});
export type Profile = z.infer<typeof profileSchema>;
export const saveSchema = z.object({
  profile: profileSchema,
  expectedVersion: z.number().int().nonnegative(),
});
export const submitSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  declaration: z.literal(true),
});
export const decisionSchema = z.object({
  taskId: z.string(),
  action: z.enum(['approve', 'reject']),
  contentHash: z.string().min(1),
  comment: text(2000).default(''),
});
export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: text(100).min(1),
  nameEn: text(100).min(1),
  active: z.boolean(),
  revision: z.number().int().nonnegative().default(0),
});
export const listSchema = z.object({
  q: text(200).default(''),
  status: z.enum(['draft', 'pending', 'rejected', 'approved']).optional(),
  category: z.string().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function decoded<T>(value: unknown): T {
  let result = value;
  while (typeof result === 'string') result = JSON.parse(result) as unknown;
  return result as T;
}
