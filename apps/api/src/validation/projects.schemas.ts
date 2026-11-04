import { z } from 'zod';

/**
 * zod input-validation schemas for the Phase 4 project endpoints. Kept in their own module (the
 * project domain owns its edge, like the chat module) but follow the exact conventions of
 * `schemas.ts`: validation happens at the route edge, never in services; services receive clean,
 * typed input and enforce the semantic + authorization rules.
 *
 * Scope note: these schemas only shape values. Whether the caller may create/update/archive a
 * project, whether the chosen owner is a workspace member, and whether a PRIVATE project is visible
 * to the caller are ALL decided by the project service against the database.
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

/** Accept either a plain calendar date (`YYYY-MM-DD`, what a date input yields) or a full ISO instant. */
const isoDateString = z.union([
  z.string().date('Must be a YYYY-MM-DD date'),
  z.string().datetime({ offset: true, error: 'Must be a valid ISO date-time' }),
]);

const projectStatusSchema = z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'], {
  error: 'Status must be PLANNING, ACTIVE, ON_HOLD or COMPLETED',
});

const projectVisibilitySchema = z.enum(['WORKSPACE', 'PRIVATE'], {
  error: 'Visibility must be WORKSPACE or PRIVATE',
});

// A SUGGESTED key (the client may propose one; the server still validates shape + de-duplicates it).
const projectKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/, 'Project key must be 2-12 letters, digits, - or _');

const nullableShortText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`).nullable();

const optionalId = z.string().trim().min(1, 'Owner is required').max(64);

export const createProjectSchema = z.object({
  name: trimmed(1, 80, 'Project name'),
  description: z.string().trim().max(500, 'Description must be at most 500 characters').optional(),
  status: projectStatusSchema.optional(),
  visibility: projectVisibilitySchema.optional(),
  ownerId: optionalId.optional(),
  projectKey: projectKeySchema.optional(),
  startDate: z.union([isoDateString, z.null()]).optional(),
  targetDate: z.union([isoDateString, z.null()]).optional(),
  icon: nullableShortText(16, 'Icon').optional(),
  color: nullableShortText(24, 'Color').optional(),
});

export const updateProjectSchema = z
  .object({
    name: trimmed(1, 80, 'Project name').optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be at most 500 characters')
      .nullable()
      .optional(),
    status: projectStatusSchema.optional(),
    visibility: projectVisibilitySchema.optional(),
    ownerId: optionalId.optional(),
    startDate: z.union([isoDateString, z.null()]).optional(),
    targetDate: z.union([isoDateString, z.null()]).optional(),
    icon: nullableShortText(16, 'Icon').optional(),
    color: nullableShortText(24, 'Color').optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.status !== undefined ||
      v.visibility !== undefined ||
      v.ownerId !== undefined ||
      v.startDate !== undefined ||
      v.targetDate !== undefined ||
      v.icon !== undefined ||
      v.color !== undefined,
    { message: 'Provide at least one field to update' },
  );

/** Query-string schema for the project list (search / filter / sort / cursor pagination). */
export const projectListQuerySchema = z.object({
  scope: z.enum(['active', 'archived', 'all']).optional(),
  status: projectStatusSchema.optional(),
  search: z.string().trim().max(120, 'Search is too long').optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'name']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be positive')
    .max(100, 'Limit is too large')
    .optional(),
  cursor: z.string().trim().max(512, 'Invalid cursor').optional(),
});
