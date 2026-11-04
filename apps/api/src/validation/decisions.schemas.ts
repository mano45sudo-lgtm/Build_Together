import { z } from 'zod';

/**
 * zod input-validation schemas for the Phase 6 Decision Vault endpoints. Same conventions as
 * `projects.schemas.ts` / `tasks.schemas.ts`: schemas only SHAPE values at the route edge; whether
 * the caller may create/edit/finalize a decision, whether a context link lives in this workspace,
 * and whether the status transition is legal are ALL decided by the decision service against the DB.
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`).nullable().optional();

const optionalId = z.string().trim().min(1).max(64);

const decisionStatusSchema = z.enum(['DRAFT', 'IN_DISCUSSION', 'FINALIZED', 'SUPERSEDED', 'ARCHIVED'], {
  error: 'Status must be DRAFT, IN_DISCUSSION, FINALIZED, SUPERSEDED or ARCHIVED',
});

/** PATCH may only move between the two working states; the rest have dedicated endpoints. */
const patchableStatusSchema = z.enum(['DRAFT', 'IN_DISCUSSION'], {
  error: 'Status can only be set to DRAFT or IN_DISCUSSION here (use the lifecycle endpoints)',
});

const decisionSourceSchema = z.enum(['PROJECT', 'CONVERSATION', 'TASK', 'MEETING', 'MANUAL']);

/** Create-time source choice for a LINKLESS decision (the server derives the rest from the links). */
const createSourceSchema = z.enum(['MEETING', 'MANUAL'], {
  error: 'Source must be MEETING or MANUAL when no project/conversation/task link is given',
});

const referenceTypeSchema = z.enum(['DOCUMENT', 'LINK', 'TASK', 'CONVERSATION', 'FILE'], {
  error: 'Reference type must be DOCUMENT, LINK, TASK, CONVERSATION or FILE',
});

/** http(s) only — a decision reference is a navigable link, never a script-capable scheme. */
const referenceUrlSchema = z
  .string()
  .trim()
  .max(500, 'URL must be at most 500 characters')
  .refine((u) => /^https?:\/\//i.test(u), 'URL must start with http:// or https://');

const alternativeInputSchema = z.object({
  label: trimmed(1, 160, 'Alternative label'),
  description: optionalText(500, 'Alternative description'),
  chosen: z.boolean().optional(),
});

const referenceInputSchema = z
  .object({
    type: referenceTypeSchema,
    label: trimmed(1, 160, 'Reference label'),
    url: referenceUrlSchema.nullish(),
    entityId: optionalId.nullish(),
  })
  .refine(
    (r) =>
      (r.type === 'TASK' || r.type === 'CONVERSATION'
        ? r.entityId !== undefined && r.entityId !== null && r.url == null
        : r.url !== undefined && r.url !== null && r.entityId == null),
    { message: 'TASK/CONVERSATION references need an entityId; DOCUMENT/LINK/FILE references need a url' },
  );

/** At most one context link may be present (a decision has exactly one originating context). */
const singleLinkRefine = (v: {
  projectId?: string | null | undefined;
  conversationId?: string | null | undefined;
  taskId?: string | null | undefined;
}) => [v.projectId, v.conversationId, v.taskId].filter((id) => id !== undefined && id !== null).length <= 1;

export const createDecisionSchema = z
  .object({
    title: trimmed(1, 200, 'Decision title'),
    background: optionalText(4000, 'Background'),
    decision: optionalText(4000, 'Decision statement'),
    rationale: optionalText(4000, 'Rationale'),
    consequences: optionalText(4000, 'Consequences'),
    status: patchableStatusSchema.optional(),
    source: createSourceSchema.optional(),
    projectId: optionalId.nullish(),
    conversationId: optionalId.nullish(),
    taskId: optionalId.nullish(),
    participantUserIds: z.array(optionalId).max(100, 'Too many participants').optional(),
    alternatives: z.array(alternativeInputSchema).max(20, 'Too many alternatives').optional(),
    references: z.array(referenceInputSchema).max(20, 'Too many references').optional(),
  })
  .refine(singleLinkRefine, { message: 'A decision links to at most one project, conversation or task' });

export const updateDecisionSchema = z
  .object({
    title: trimmed(1, 200, 'Decision title').optional(),
    background: optionalText(4000, 'Background'),
    decision: optionalText(4000, 'Decision statement'),
    rationale: optionalText(4000, 'Rationale'),
    consequences: optionalText(4000, 'Consequences'),
    status: patchableStatusSchema.optional(),
    alternatives: z.array(alternativeInputSchema).max(20, 'Too many alternatives').optional(),
    references: z.array(referenceInputSchema).max(20, 'Too many references').optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.background !== undefined ||
      v.decision !== undefined ||
      v.rationale !== undefined ||
      v.consequences !== undefined ||
      v.status !== undefined ||
      v.alternatives !== undefined ||
      v.references !== undefined,
    { message: 'Provide at least one field to update' },
  );

export const supersedeDecisionSchema = z.object({
  byDecisionId: optionalId.transform((v) => v ?? ''),
});

export const decisionParticipantSchema = z.object({
  userId: optionalId.transform((v) => v ?? ''),
});

export const createDecisionCommentSchema = z.object({
  body: trimmed(1, 2000, 'Comment'),
});

/** Query-string schema for the decision list (search / filter / sort / cursor pagination). */
export const decisionListQuerySchema = z.object({
  status: decisionStatusSchema.optional(),
  projectId: optionalId.optional(),
  source: decisionSourceSchema.optional(),
  participantId: optionalId.optional(),
  search: z.string().trim().max(120, 'Search is too long').optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'title', 'status']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be positive')
    .max(100, 'Limit is too large')
    .optional(),
  cursor: z.string().trim().max(512, 'Invalid cursor').optional(),
});

/** Query-string schema for the paginated history / comment feeds. */
export const decisionFeedQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be positive')
    .max(100, 'Limit is too large')
    .optional(),
  cursor: z.string().trim().max(512, 'Invalid cursor').optional(),
});
