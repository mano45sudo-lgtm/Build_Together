import type {
  CreateProjectInput,
  ProjectOverview,
  ProjectScope,
  ProjectSortField,
  ProjectStatus,
  ProjectView,
  UpdateProjectInput,
  WorkspaceRole,
} from '@buildtogether/shared';
import { badRequest, conflict, forbidden, notFound } from '../errors/app-error.js';
import * as projectRepo from '../repositories/project.repo.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';
import { toProjectView } from '../lib/view.js';

/**
 * Projects business logic. The route middleware (`authenticate` + `requireWorkspaceRole`) has ALREADY
 * proven (fresh, from the DB) that the caller is a member of the path workspace and attached their
 * role. This service adds the PROJECT-level rules on top — the ones the coarse workspace gate cannot
 * express — and never trusts a client-supplied workspace/user id.
 *
 * Permission matrix (server-side; the desktop UI only mirrors this for visibility):
 *   - VIEW (list / get / overview): every workspace member. A PRIVATE project is additionally limited
 *       to its owner + creator, and to workspace OWNER/ADMIN (oversight). Denied PRIVATE reads are a
 *       404 (existence is not leaked across the visibility boundary).
 *   - CREATE: any MEMBER+ . Owner defaults to the creator; assigning a DIFFERENT owner is an
 *       OWNER/ADMIN action and the target must be a current workspace member.
 *   - UPDATE / ARCHIVE / RESTORE / CHANGE-OWNER: workspace OWNER/ADMIN, or the project's own
 *       owner/creator (a MEMBER manages the projects they own, nothing else).
 *   - A project ALWAYS has exactly one owner (a real workspace member); ownership is reassigned, never
 *       removed, so there is no "ownerless" state to reach.
 *
 * Authorization is re-derived from the database on every mutation. Hiding a control in the renderer is
 * never the security boundary (ADR-0003 §7 / security-review).
 */

export interface Caller {
  userId: string;
  role: WorkspaceRole;
}

// ---- key + slug generation (documented rules, uniqueness enforced per workspace) ----

/** Human, URL-safe, workspace-unique slug derived from the project name. */
function baseSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug.length >= 2 ? slug : 'project';
}

/** Short UPPER identifier (e.g. `ACME`), from a suggested key or the name's first significant token. */
function baseKey(name: string, suggested?: string): string {
  if (suggested)
    return suggested
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 12);
  const compact = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length >= 2) return compact.slice(0, 6);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (initials || 'PRJ').slice(0, 6);
}

/**
 * Find an unused variant of `base` within the workspace by appending `-2`, `-3`, … (bounded, then a
 * random fallback). Uniqueness is also guaranteed by the DB unique constraint (race → P2002 → conflict).
 */
async function uniquify(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) return base;
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  const fallback = `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  if (!(await exists(fallback))) return fallback;
  throw conflict(
    'PROJECT_KEY_TAKEN',
    'Could not allocate a unique project key; try a different name',
  );
}

// ---- date coercion ----

type DateInput = string | null | undefined;

function toDate(value: DateInput): Date | null | undefined {
  if (value === undefined) return undefined; // field absent → leave unchanged
  if (value === null) return null; // explicit null → clear
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest('INVALID_DATE', 'Provide a valid date');
  return d;
}

// ---- authorization helpers ----

function canManage(project: ProjectView, caller: Caller): boolean {
  if (caller.role === 'OWNER' || caller.role === 'ADMIN') return true;
  return caller.userId === project.owner.id || caller.userId === project.createdById;
}

function canView(project: ProjectView, caller: Caller): boolean {
  if (caller.role === 'OWNER' || caller.role === 'ADMIN') return true;
  if (project.visibility === 'WORKSPACE') return true;
  return caller.userId === project.owner.id || caller.userId === project.createdById;
}

/** Assert `userId` is currently a member of `workspaceId` (an owner must be a real member). */
async function requireMember(workspaceId: string, userId: string, message: string): Promise<void> {
  const role = await workspaceRepo.getRole(workspaceId, userId);
  if (!role) throw badRequest('OWNER_NOT_MEMBER', message);
}

// ---- create ----

export async function createProject(
  workspaceId: string,
  caller: Caller,
  input: CreateProjectInput,
): Promise<ProjectView> {
  // Owner defaults to the creator. Assigning a different owner up front is an OWNER/ADMIN action.
  let ownerId = caller.userId;
  if (input.ownerId && input.ownerId !== caller.userId) {
    if (caller.role === 'MEMBER') {
      throw forbidden('INSUFFICIENT_ROLE', 'Only an admin can create a project for another owner');
    }
    await requireMember(workspaceId, input.ownerId, 'The project owner must be a workspace member');
    ownerId = input.ownerId;
  }

  const key = await uniquify(baseKey(input.name, input.projectKey), (candidate) =>
    projectRepo.keyExistsInWorkspace(workspaceId, candidate),
  );
  const slug = await uniquify(baseSlug(input.name), (candidate) =>
    projectRepo.slugExistsInWorkspace(workspaceId, candidate),
  );

  const start = toDate(input.startDate ?? undefined);
  const target = toDate(input.targetDate ?? undefined);

  const created = await projectRepo.createProject({
    workspaceId,
    name: input.name,
    slug,
    projectKey: key,
    description: input.description ?? null,
    status: (input.status ?? 'ACTIVE') as ProjectStatus,
    visibility: (input.visibility ?? 'WORKSPACE') as 'WORKSPACE' | 'PRIVATE',
    ownerId,
    createdById: caller.userId,
    startDate: start ?? null,
    targetDate: target ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
  });

  return toProjectView(created);
}

// ---- read ----

export interface ProjectListResult {
  items: ProjectView[];
  nextCursor: string | null;
}

export async function listProjects(
  workspaceId: string,
  caller: Caller,
  query: {
    scope?: ProjectScope;
    status?: ProjectStatus;
    search?: string;
    sort?: ProjectSortField;
    dir?: 'asc' | 'desc';
    limit?: number;
    cursor?: string;
  },
): Promise<ProjectListResult> {
  const scope = query.scope ?? 'active';
  const sort = query.sort ?? 'updatedAt';
  const dir = query.dir ?? 'desc';
  const limit = query.limit ?? 20;

  const { rows, nextCursor } = await projectRepo.listProjects({
    workspaceId,
    scope,
    status: query.status,
    search: query.search && query.search.length > 0 ? query.search : undefined,
    sort,
    dir,
    limit,
    cursor: query.cursor,
    callerRole: caller.role,
    callerId: caller.userId,
  });

  return { items: rows.map(toProjectView), nextCursor };
}

/** Read a single project. Cross-workspace id → 404; visible-but-not-manageable is fine (read gate). */
export async function getProject(
  projectId: string,
  workspaceId: string,
  caller: Caller,
): Promise<ProjectView> {
  const row = await projectRepo.findProject(projectId, workspaceId);
  if (!row) throw notFound('PROJECT_NOT_FOUND', 'Project not found');
  const project = toProjectView(row);
  if (!canView(project, caller)) throw notFound('PROJECT_NOT_FOUND', 'Project not found');
  return project;
}

export async function getOverview(
  projectId: string,
  workspaceId: string,
  caller: Caller,
): Promise<ProjectOverview> {
  const found = await projectRepo.findProjectWithWorkspace(projectId, workspaceId);
  if (!found) throw notFound('PROJECT_NOT_FOUND', 'Project not found');
  const project = toProjectView(found.project);
  if (!canView(project, caller)) throw notFound('PROJECT_NOT_FOUND', 'Project not found');
  return { project, workspace: found.workspace };
}

// ---- update ----

export async function updateProject(
  projectId: string,
  workspaceId: string,
  caller: Caller,
  input: UpdateProjectInput,
): Promise<ProjectView> {
  const row = await projectRepo.findProject(projectId, workspaceId);
  if (!row) throw notFound('PROJECT_NOT_FOUND', 'Project not found');
  const current = toProjectView(row);
  if (!canManage(current, caller)) {
    throw forbidden('INSUFFICIENT_ROLE', 'You can only manage projects you own or created');
  }

  // Changing owner: the target must be a current workspace member. The project always keeps an owner.
  if (input.ownerId && input.ownerId !== current.owner.id) {
    await requireMember(
      workspaceId,
      input.ownerId,
      'The new project owner must be a workspace member',
    );
  }

  const start = toDate(input.startDate);
  const target = toDate(input.targetDate);

  const updated = await projectRepo.updateProject(projectId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.status !== undefined ? { status: input.status as ProjectStatus } : {}),
    ...(input.visibility !== undefined
      ? { visibility: input.visibility as 'WORKSPACE' | 'PRIVATE' }
      : {}),
    ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    ...(start !== undefined ? { startDate: start } : {}),
    ...(target !== undefined ? { targetDate: target } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  });

  return toProjectView(updated);
}

// ---- archive / restore ----

export async function archiveProject(
  projectId: string,
  workspaceId: string,
  caller: Caller,
): Promise<ProjectView> {
  const row = await projectRepo.findProject(projectId, workspaceId);
  if (!row) throw notFound('PROJECT_NOT_FOUND', 'Project not found');
  const current = toProjectView(row);
  if (!canManage(current, caller)) {
    throw forbidden('INSUFFICIENT_ROLE', 'You can only manage projects you own or created');
  }
  if (current.archivedAt) return current; // idempotent
  return toProjectView(await projectRepo.setArchived(projectId, new Date()));
}

export async function restoreProject(
  projectId: string,
  workspaceId: string,
  caller: Caller,
): Promise<ProjectView> {
  const row = await projectRepo.findProject(projectId, workspaceId);
  if (!row) throw notFound('PROJECT_NOT_FOUND', 'Project not found');
  const current = toProjectView(row);
  if (!canManage(current, caller)) {
    throw forbidden('INSUFFICIENT_ROLE', 'You can only manage projects you own or created');
  }
  if (!current.archivedAt) return current; // idempotent
  return toProjectView(await projectRepo.setArchived(projectId, null));
}
