import type { Request, Response } from 'express';
import type { AddConversationMembersInput, CreateConversationInput } from '@buildtogether/shared';
import { forbidden, unauthorized } from '../../errors/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { created, ok } from '../../lib/respond.js';
import * as conversation from './conversation.service.js';
import * as token from './token.service.js';
import * as webhook from './webhook.service.js';

/**
 * Chat HTTP layer. Workspace membership + authz are already resolved by middleware
 * (`authenticate` + `requireWorkspaceRole`); this only extracts trusted context (never a client-supplied
 * workspace/user id) and delegates to the services. The webhook route is the one UNAUTHENTICATED entry
 * point — its authenticity comes solely from the App-Secret signature verified in the webhook service.
 */

function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

function needWorkspaceId(req: Request): string {
  const ws = req.workspace;
  if (!ws) throw forbidden('WORKSPACE_NOT_SELECTED', 'No workspace selected');
  return ws.workspaceId;
}

function needConversationId(req: Request): string {
  const id = req.params.conversationId;
  if (typeof id !== 'string') throw forbidden('CONVERSATION_NOT_FOUND', 'Conversation not found');
  return id;
}

export const getToken = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await token.issueChatToken(needUserId(req)));
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await conversation.listConversations(needWorkspaceId(req), needUserId(req)));
});

export const createConversation = asyncHandler(async (req: Request, res: Response) => {
  const createdSummary = await conversation.createConversation(
    needWorkspaceId(req),
    needUserId(req),
    req.body as CreateConversationInput,
  );
  created(res, createdSummary);
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    await conversation.getConversation(
      needConversationId(req),
      needWorkspaceId(req),
      needUserId(req),
    ),
  );
});

export const addMembers = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    await conversation.addMembers(
      needConversationId(req),
      needWorkspaceId(req),
      needUserId(req),
      (req.body as AddConversationMembersInput).userIds,
    ),
  );
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const targetUserId = req.params.userId;
  await conversation.removeMember(
    needConversationId(req),
    needWorkspaceId(req),
    needUserId(req),
    typeof targetUserId === 'string' ? targetUserId : '',
  );
  ok(res, null);
});

/** Read the first present header among `names` (Node lower-cases header keys). */
function header(req: Request, names: string[]): string | undefined {
  for (const name of names) {
    const value = req.header(name);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/**
 * Nexconn (RongCloud) server callback. No BT auth — the signature IS the authentication. Responds with
 * the `code`/`sign` acknowledgement the callback protocol expects; failures surface as a non-200 so the
 * provider retries rather than treating a spoofed/unverifiable push as accepted.
 */
export const receiveWebhook = asyncHandler(async (req: Request, res: Response) => {
  const outcome = await webhook.verifyAndRecordWebhook({
    nonce: header(req, ['nonce', 'rc-nonce']),
    timestamp: header(req, ['timestamp', 'rc-timestamp']),
    signature: header(req, ['signature', 'rc-signature']),
    payload: req.body,
  });
  res.status(200).json({ code: 200, sign: outcome.sign });
});
