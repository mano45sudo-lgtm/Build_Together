import { z } from 'zod';

/**
 * zod input-validation for the Phase 7 intelligence endpoints. Same contract as `projects.schemas.ts`:
 * shapes are decided at the route edge, never in the service. These are READ-ONLY aggregates plus the
 * one user-state write (a dismissal) — there is no create/update of any project/task/decision here.
 *
 * Scope note: validation never widens access. Which project signals the caller can see is decided by
 * the orchestrator against the database (project visibility); a dismissal is stored only against the
 * caller's own (workspace, user) key.
 */

const insightKindSchema = z.enum(['RECOMMENDATION', 'BLOCKER', 'RISK'], {
  error: 'Kind must be RECOMMENDATION, BLOCKER or RISK',
});

const dismissalStateSchema = z.enum(['DISMISSED', 'RESOLVED'], {
  error: 'State must be DISMISSED or RESOLVED',
});

const dedupKeySchema = z
  .string()
  .trim()
  .min(1, 'A signal key is required')
  .max(200, 'Signal key is too long');

/** Query for the read-only endpoints: the deadline window in days, clamped server-side. */
export const intelligenceQuerySchema = z.object({
  deadlineWindowDays: z.coerce
    .number()
    .int('deadlineWindowDays must be an integer')
    .min(1, 'deadlineWindowDays must be positive')
    .max(90, 'deadlineWindowDays is too large')
    .optional(),
});

/** Record (or re-state) the caller's dismissal of a computed signal. `dedupKey` is a key the engine emitted. */
export const createDismissalSchema = z.object({
  kind: insightKindSchema,
  dedupKey: dedupKeySchema,
  state: dismissalStateSchema.default('DISMISSED'),
});

/** Remove a dismissal (un-dismiss) so the signal resurfaces on the next read. */
export const deleteDismissalSchema = z.object({
  kind: insightKindSchema,
  dedupKey: dedupKeySchema,
});
