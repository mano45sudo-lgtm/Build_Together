/**
 * Phase 4 project contracts (workspace-scoped projects — the primary organizational unit).
 *
 * Single source of truth compiled by BOTH `@buildtogether/api` (request/response shapes) and the
 * `@buildtogether/desktop` renderer + main IPC surface, so the API envelope, the bridge and the UI
 * can never drift (mirrors `domain.ts` / `chat.ts`). Types + const tables only — no runtime logic.
 *
 * SECURITY: these are read/write DTOs only. Authorization is decided server-side (workspace
 * membership + role + project ownership) on every request — a client sending an `ownerId` or a
 * `workspaceId` never gains access; the server re-derives everything from the database.
 */

import type { ApiResponse } from './index.js';

// ---- Enums (mirror the Prisma enums; string unions for the wire) ----

/**
 * Work lifecycle. ARCHIVED is intentionally absent: archive state is carried solely by
 * `ProjectView.archivedAt`, so "is this archived?" is never stored twice (see schema.prisma note).
 */
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';

/** Who can see a project inside its workspace. PRIVATE = owner + creator + workspace OWNER/ADMIN. */
export type ProjectVisibility = 'WORKSPACE' | 'PRIVATE';

/** Closed vocabularies, exported so validation + the UI select the same values. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'PLANNING',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
] as const;

export const PROJECT_VISIBILITIES: readonly ProjectVisibility[] = ['WORKSPACE', 'PRIVATE'] as const;

// ---- Read models ----

/** The project owner as shown on a card / header (avatar-safe subset of a user). */
export interface ProjectOwnerView {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * A project as returned to an authorized caller. Dates are ISO strings. `archivedAt` is null for a
 * live project; when set the project is archived (regardless of `status`). `slug`/`projectKey` are
 * unique within the workspace only.
 */
export interface ProjectView {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  projectKey: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  owner: ProjectOwnerView;
  createdById: string;
  startDate: string | null;
  targetDate: string | null;
  icon: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/**
 * The project-workspace overview. Beyond the project itself it carries the workspace name so the
 * header renders workspace context in one round-trip (no separate fetch, no invented statistics).
 */
export interface ProjectOverview {
  project: ProjectView;
  workspace: { id: string; name: string };
}

// ---- List query (search / filter / sort / pagination) ----

/** Scope of a project listing. `archived` shows only archived; `active` shows only non-archived;
 *  `all` shows both. Defaults (server-side) to `active`. */
export type ProjectScope = 'active' | 'archived' | 'all';

/** Sortable columns. */
export type ProjectSortField = 'createdAt' | 'updatedAt' | 'name';

export interface ProjectListQuery {
  scope?: ProjectScope;
  status?: ProjectStatus;
  /** Substring match against project name and project key (case-insensitive). */
  search?: string;
  sort?: ProjectSortField;
  dir?: 'asc' | 'desc';
  limit?: number;
  /** Opaque forward cursor (base64 of the last seen sort key + id). */
  cursor?: string;
}

// ---- Write inputs (validated server-side; mirrored here for typed clients) ----

/**
 * Create a project. `projectKey`/`slug` are generated server-side when absent (a caller may SUGGEST a
 * key, which is still validated + de-duplicated server-side). `ownerId` defaults to the creator and is
 * re-checked as a workspace member — the client can never assign an owner who is not a member.
 */
export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  ownerId?: string;
  projectKey?: string;
  startDate?: string | null;
  targetDate?: string | null;
  icon?: string | null;
  color?: string | null;
}

/** Partial update; the validation edge guarantees at least one field is present. */
export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  ownerId?: string;
  startDate?: string | null;
  targetDate?: string | null;
  icon?: string | null;
  color?: string | null;
}

// ---- API endpoint aliases (self-documenting response types) ----

export type ProjectListResponse = ApiResponse<ProjectView[]>;
export type ProjectResponse = ApiResponse<ProjectView>;
export type ProjectOverviewResponse = ApiResponse<ProjectOverview>;
