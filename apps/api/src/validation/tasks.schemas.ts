import { z } from 'zod';

/**
 * zod input-validation schemas for the Phase 5 task endpoints. Same conventions as
 * `projects.schemas.ts`: validation happens at the route edge; services receive clean, typed input and
 * enforce the semantic + authorization rules (project boundary, workspace membership of the assignee,
 * dependency legality) against the database.
 *
 * These schemas only SHAPE values. They cannot and do not decide whether the caller may act, whether an
 * assignee is a member, or whether a dependency is legal — those are server-side (task.service).
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

/** Accept either a plain calendar date (`YYYY-MM-DD`) or a full ISO instant. */
const isoDateString = z.union([
  z.string().date('Must be a YYYY-MM-DD date'),
  z.string().datetime({ offset: true, error: 'Must be a valid ISO date-time' }),
]);

const dateOrNull = z.union([isoDateString, z.null()]);

const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'], {
  error: 'Status must be TODO, IN_PROGRESS, IN_REVIEW or DONE',
});

const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
  error: 'Priority must be LOW, MEDIUM, HIGH or URGENT',
});

const optionalId = z.string().trim().min(1).max(64);
/** A nullable id (assignee can be set OR cleared — null means "unassigned"). */
const nullableId = z.union([optionalId, z.null()]);

/** A bounded list of prerequisite task ids. Duplicates / self / cycles are rejected in the service. */
const dependencyIdsSchema = z.array(optionalId).max(50, 'Too many dependencies at once');

export const createTaskSchema = z.object({
  title: trimmed(1, 200, 'Task title'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be at most 2000 characters')
    .optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: nullableId.optional(),
  startDate: dateOrNull.optional(),
  dueDate: dateOrNull.optional(),
  dependencyIds: dependencyIdsSchema.optional(),
});

export const updateTaskSchema = z
  .object({
    title: trimmed(1, 200, 'Task title').optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description must be at most 2000 characters')
      .nullable()
      .optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    startDate: dateOrNull.optional(),
    dueDate: dateOrNull.optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.status !== undefined ||
      v.priority !== undefined ||
      v.startDate !== undefined ||
      v.dueDate !== undefined,
    { message: 'Provide at least one field to update' },
  );

export const assignTaskSchema = z.object({
  assigneeId: nullableId,
});

export const changeTaskStatusSchema = z.object({
  status: taskStatusSchema,
});

export const addTaskDependencySchema = z.object({
  dependsOnTaskId: optionalId,
});

/** Query-string schema for the task list (search / filter / sort / cursor pagination). */
export const taskListQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: optionalId.optional(),
  unassigned: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  search: z.string().trim().max(120, 'Search is too long').optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'dueDate', 'title', 'priority', 'status']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be positive')
    .max(100, 'Limit is too large')
    .optional(),
  cursor: z.string().trim().max(512, 'Invalid cursor').optional(),
});

/** Activity feed is a simple time-ordered cursor list (no filter/sort surface). */
export const taskActivityQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be positive')
    .max(100, 'Limit is too large')
    .optional(),
  cursor: z.string().trim().max(512, 'Invalid cursor').optional(),
});
