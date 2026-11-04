import type { ProjectScope, ProjectSortField, ProjectStatus } from '@buildtogether/shared';
import type { WorkspaceRole } from '@buildtogether/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { ProjectRow } from '../lib/view.js';

/**
 * Project persistence (the ONLY Prisma layer of the domain). Returns `ProjectRow` projections and
 * never touches the wire format (backend-engineering rule). Every read is workspace-scoped by the
 * caller; the repository additionally narrows PRIVATE-visibility rows to the members allowed to see
 * them, so a listing never leaks a private project across the visibility boundary.
 */

/** Owner is always hydrated; the rest are scalar columns the projection maps directly. */
const projectSelect = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  description: true,
  projectKey: true,
  status: true,
  visibility: true,
  ownerId: true,
  createdById: true,
  startDate: true,
  targetDate: true,
  icon: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  owner: { select: { id: true, name: true, avatarUrl: true } },
} as const satisfies Prisma.ProjectSelect;

type ProjectPrismaRow = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  projectKey: string;
  status: ProjectStatus;
  visibility: 'WORKSPACE' | 'PRIVATE';
  ownerId: string;
  createdById: string;
  startDate: Date | null;
  targetDate: Date | null;
  icon: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  owner: { id: string; name: string; avatarUrl: string | null };
};

function toRow(row: ProjectPrismaRow): ProjectRow {
  return row as unknown as ProjectRow;
}

export interface CreateProjectData {
  workspaceId: string;
  name: string;
  slug: string;
  projectKey: string;
  description: string | null;
  status: ProjectStatus;
  visibility: 'WORKSPACE' | 'PRIVATE';
  ownerId: string;
  createdById: string;
  startDate: Date | null;
  targetDate: Date | null;
  icon: string | null;
  color: string | null;
}

export async function createProject(data: CreateProjectData): Promise<ProjectRow> {
  const row = await prisma.project.create({ data, select: projectSelect });
  return toRow(row as unknown as ProjectPrismaRow);
}

/** Is this project key already used inside the workspace? (keys are unique per workspace). */
export async function keyExistsInWorkspace(workspaceId: string, key: string): Promise<boolean> {
  const count = await prisma.project.count({ where: { workspaceId, projectKey: key } });
  return count > 0;
}

export async function slugExistsInWorkspace(workspaceId: string, slug: string): Promise<boolean> {
  const count = await prisma.project.count({ where: { workspaceId, slug } });
  return count > 0;
}

/** A project by id, projected with its owner. `workspaceId` (when given) enforces path-scoping: a
 * project that does not belong to that workspace reads as not-found (no cross-workspace leak). */
export async function findProject(
  projectId: string,
  workspaceId?: string,
): Promise<ProjectRow | null> {
  const row = await prisma.project.findFirst({
    where: { id: projectId, ...(workspaceId ? { workspaceId } : {}) },
    select: { ...projectSelect, workspace: { select: { id: true, name: true } } },
  });
  if (!row) return null;
  return toRow(row as unknown as ProjectPrismaRow);
}

/** The workspace summary the project-overview screen needs, read in the same query as the project. */
export async function findProjectWithWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<{ project: ProjectRow; workspace: { id: string; name: string } } | null> {
  const row = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { ...projectSelect, workspace: { select: { id: true, name: true } } },
  });
  if (!row) return null;
  const { workspace, ...rest } = row as unknown as ProjectPrismaRow & {
    workspace: { id: string; name: string };
  };
  return { project: toRow(rest as unknown as ProjectPrismaRow), workspace };
}

export interface ProjectUpdate {
  name?: string;
  slug?: string;
  description?: string | null;
  status?: ProjectStatus;
  visibility?: 'WORKSPACE' | 'PRIVATE';
  ownerId?: string;
  startDate?: Date | null;
  targetDate?: Date | null;
  icon?: string | null;
  color?: string | null;
}

export async function updateProject(projectId: string, data: ProjectUpdate): Promise<ProjectRow> {
  const row = await prisma.project.update({
    where: { id: projectId },
    data,
    select: projectSelect,
  });
  return toRow(row as unknown as ProjectPrismaRow);
}

/** Archive (timestamp set) / restore (timestamp cleared). The single source of truth for archive state. */
export async function setArchived(projectId: string, archivedAt: Date | null): Promise<ProjectRow> {
  const row = await prisma.project.update({
    where: { id: projectId },
    data: { archivedAt },
    select: projectSelect,
  });
  return toRow(row as unknown as ProjectPrismaRow);
}

/** The current owner id of a project (used to validate an ownership change keeps a real member). */
export async function getProjectOwnerAndCreator(
  projectId: string,
): Promise<{ ownerId: string; createdById: string; visibility: 'WORKSPACE' | 'PRIVATE' } | null> {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, createdById: true, visibility: true },
  });
  return row
    ? { ownerId: row.ownerId, createdById: row.createdById, visibility: row.visibility }
    : null;
}

export interface ListProjectsParams {
  workspaceId: string;
  scope: ProjectScope;
  status: ProjectStatus | undefined;
  search: string | undefined;
  sort: ProjectSortField;
  dir: 'asc' | 'desc';
  limit: number;
  cursor: string | undefined;
  callerRole: WorkspaceRole;
  callerId: string;
}

/** Forward-cursor keyset pagination over the chosen sort column, tie-broken by id (stable + unique). */
function encodeCursor(
  row: { createdAt: Date; updatedAt: Date; name: string; id: string },
  sort: ProjectSortField,
): string {
  const value =
    sort === 'name'
      ? row.name
      : sort === 'createdAt'
        ? row.createdAt.toISOString()
        : row.updatedAt.toISOString();
  return Buffer.from(JSON.stringify({ v: value, id: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { v: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { v?: unknown }).v === 'string' &&
      typeof (parsed as { id?: unknown }).id === 'string'
    ) {
      return parsed as { v: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

export async function listProjects(
  params: ListProjectsParams,
): Promise<{ rows: ProjectRow[]; nextCursor: string | null }> {
  const { workspaceId, scope, status, search, sort, dir, limit, cursor, callerRole, callerId } =
    params;

  const where: Prisma.ProjectWhereInput = { workspaceId };
  // Accumulate the extra conjunctive filters in a local array; assigning back to `where.AND` at the
  // end keeps the type a plain `ProjectWhereInput[]` (Prisma types `AND` as a union of object|array).
  const and: Prisma.ProjectWhereInput[] = [];

  // Scope (archive is derived solely from archivedAt — never a status value).
  if (scope === 'active') where.archivedAt = null;
  else if (scope === 'archived') where.archivedAt = { not: null };

  if (status) where.status = status;

  // Visibility: a plain MEMBER sees WORKSPACE projects plus their own PRIVATE ones. OWNER/ADMIN
  // see every project in the workspace (management oversight). This is the read-side of §PRIVATE.
  if (callerRole === 'MEMBER') {
    and.push({
      OR: [{ visibility: 'WORKSPACE' }, { ownerId: callerId }, { createdById: callerId }],
    });
  }

  // Search by name OR project key, case-insensitive (Postgres `mode: 'insensitive'`).
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { projectKey: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  // Keyset predicate for a forward cursor (exclude the already-seen row and everything before it).
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    const cmp = dir === 'asc' ? 'gt' : 'lt';
    const column = sort; // createdAt | updatedAt | name — all map 1:1 to Prisma fields
    const keyCondition: Prisma.ProjectWhereInput =
      cmp === 'gt'
        ? {
            OR: [
              { [column]: { gt: decoded.v } },
              { AND: [{ [column]: decoded.v }, { id: { gt: decoded.id } }] },
            ],
          }
        : {
            OR: [
              { [column]: { lt: decoded.v } },
              { AND: [{ [column]: decoded.v }, { id: { lt: decoded.id } }] },
            ],
          };
    and.push(keyCondition);
  }

  if (and.length > 0) where.AND = and;

  // `limit + 1` so we can tell whether another page exists without a second count query.
  const rows = await prisma.project.findMany({
    where,
    select: projectSelect,
    orderBy: [{ [sort]: dir }, { id: dir }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    rows: page.map((r) => toRow(r as unknown as ProjectPrismaRow)),
    nextCursor:
      hasMore && last
        ? encodeCursor(
            { createdAt: last.createdAt, updatedAt: last.updatedAt, name: last.name, id: last.id },
            sort,
          )
        : null,
  };
}
