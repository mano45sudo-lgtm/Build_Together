import type { Request, Response } from 'express';
import type { CreateDecisionInput, DecisionListQuery, UpdateDecisionInput } from '@buildtogether/shared';
import { forbidden, unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, ok } from '../lib/respond.js';
import * as service from '../services/decision.service.js';

/**
 * Decisions HTTP layer (Phase 6 — Decision Vault). The route middleware already guaranteed `req.auth`
 * (authenticated) and `req.workspace` (server-verified membership + role for the path workspace).
 * This layer only extracts trusted context (never a client-supplied workspace/user id) and delegates
 * to the service, which owns the visibility/management matrix and the lifecycle rules.
 */

function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

function needWorkspace(req: Request): { workspaceId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } {
  const ws = req.workspace;
  if (!ws) throw forbidden('WORKSPACE_NOT_SELECTED', 'No workspace selected');
  return { workspaceId: ws.workspaceId, role: ws.role };
}

function needDecisionId(req: Request): string {
  const id = req.params.decisionId;
  if (typeof id !== 'string') throw forbidden('DECISION_NOT_FOUND', 'Decision not found');
  return id;
}

/** Run the service with the trusted caller + workspace context extracted from the request. */
function caller(req: Request): service.Caller & { workspaceId: string } {
  const { workspaceId, role } = needWorkspace(req);
  return { workspaceId, userId: needUserId(req), role };
}

/** Attach the forward cursor + applied limit to the envelope meta so clients paginate safely. */
function sendPage(res: Response, result: { items: unknown[]; nextCursor: string | null }, query: { limit?: number }) {
  const meta = result.nextCursor
    ? { cursor: result.nextCursor, ...(query.limit ? { limit: query.limit } : {}) }
    : undefined;
  ok(res, result.items, meta);
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const query = (req.validatedQuery ?? {}) as DecisionListQuery;
  const result = await service.listDecisions(c.workspaceId, c, query);
  sendPage(res, result, query);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  created(res, await service.createDecision(c.workspaceId, c, req.body as CreateDecisionInput));
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  ok(res, await service.getDecision(needDecisionId(req), c.workspaceId, c));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  ok(
    res,
    await service.updateDecision(needDecisionId(req), c.workspaceId, c, req.body as UpdateDecisionInput),
  );
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  ok(res, await service.deleteDecision(needDecisionId(req), c.workspaceId, c));
});

// ---- lifecycle ----

export const finalize = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  ok(res, await service.finalizeDecision(needDecisionId(req), c.workspaceId, c));
});

export const supersede = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const body = req.body as { byDecisionId: string };
  ok(res, await service.supersedeDecision(needDecisionId(req), c.workspaceId, c, body.byDecisionId));
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  ok(res, await service.archiveDecision(needDecisionId(req), c.workspaceId, c));
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  ok(res, await service.restoreDecision(needDecisionId(req), c.workspaceId, c));
});

// ---- participants ----

export const addParticipant = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const body = req.body as { userId: string };
  ok(res, await service.addParticipant(needDecisionId(req), c.workspaceId, c, body.userId));
});

export const removeParticipant = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const userId = req.params.userId;
  if (typeof userId !== 'string') throw forbidden('PARTICIPANT_NOT_FOUND', 'Participant not found');
  ok(res, await service.removeParticipant(needDecisionId(req), c.workspaceId, c, userId));
});

// ---- history + comments ----

export const history = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const query = (req.validatedQuery ?? {}) as { limit?: number; cursor?: string };
  const result = await service.listHistory(needDecisionId(req), c.workspaceId, c, query);
  sendPage(res, result, query);
});

export const listComments = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const query = (req.validatedQuery ?? {}) as { limit?: number; cursor?: string };
  const result = await service.listComments(needDecisionId(req), c.workspaceId, c, query);
  sendPage(res, result, query);
});

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const body = req.body as { body: string };
  created(res, await service.addComment(needDecisionId(req), c.workspaceId, c, body.body));
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const c = caller(req);
  const commentId = req.params.commentId;
  if (typeof commentId !== 'string') throw forbidden('COMMENT_NOT_FOUND', 'Comment not found');
  ok(res, await service.deleteComment(needDecisionId(req), commentId, c.workspaceId, c));
});
