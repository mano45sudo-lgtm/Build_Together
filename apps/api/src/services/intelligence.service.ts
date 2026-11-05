import type {
  CreateDismissalInput,
  DecisionRevisionImpact,
  IntelligenceDismissalView,
  PersonalIntelligence,
  ProjectIntelligenceOverview,
} from '@buildtogether/shared';
import * as intelligenceRepo from '../repositories/intelligence.repo.js';
import type { DecisionSignal } from '../repositories/intelligence.repo.js';
import * as projectService from './project.service.js';
import * as taskService from './task.service.js';
import { APPROACHING_WINDOW_DAYS } from './intelligence/common.js';
import { computeHealth, computeMetrics } from './intelligence/health.js';
import { detectBlockers } from './intelligence/blockers.js';
import { detectRisks } from './intelligence/risk.js';
import { buildRecommendations } from './intelligence/recommendations.js';
import { computeDecisionImpacts } from './intelligence/impacts.js';
import { buildPersonalIntelligence } from './intelligence/personal.js';

/**
 * Execution-intelligence orchestrator (Phase 7). This is the ONLY layer that touches persistence and
 * the only one that composes the pure detectors. Its contract with the engine:
 *
 *   1. AUTHORIZE FIRST. A project read is gated through `projectService.getProject`, which enforces
 *      workspace membership (done at the mount) + project visibility and throws 404 for anything the
 *      caller cannot see — so we never compute signals over a project the caller lacks rights to.
 *      Personal intelligence reuses `taskService.listMyTasks`, already visibility-filtered per project.
 *   2. DERIVE, DON'T STORE. Health / blockers / risks / recommendations are recomputed on read from
 *      live rows; nothing derived is persisted, so it can never drift. Only a user's dismissal state
 *      is durable (and dismissing an item hides it from the LIST; it never rewrites health, which must
 *      stay truthful).
 *   3. NO AUTO-EFFECT. Nothing here mutates a task, decision, or assignment. Recommendations point at
 *      real entities with a destination; the human acts.
 */

export interface IntelligenceCaller {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

/** Resolve the affected-task briefs for superseded decisions, then compute impact (skips deleted tasks). */
async function buildDecisionImpacts(
  workspaceId: string,
  decisions: DecisionSignal[],
): Promise<DecisionRevisionImpact[]> {
  const affectedIds = [
    ...new Set(decisions.filter((d) => d.supersededById !== null).flatMap((d) => d.linkedTaskIds)),
  ];
  const briefs = await intelligenceRepo.getTaskBriefsByIds(workspaceId, affectedIds);
  return computeDecisionImpacts(decisions, briefs);
}

/** The full Project Intelligence Overview in one authorized, dismissal-filtered read. */
export async function getProjectIntelligence(
  projectId: string,
  workspaceId: string,
  caller: IntelligenceCaller,
  windowDays: number = APPROACHING_WINDOW_DAYS,
): Promise<ProjectIntelligenceOverview> {
  // (1) Authorize before any signal is read. A denied/foreign project id never reaches the engine.
  await projectService.getProject(projectId, workspaceId, caller);
  const signals = await intelligenceRepo.getProjectSignals(workspaceId, projectId);
  const { project, tasks, decisions } = signals;
  const now = Date.now();

  const blockers = detectBlockers(workspaceId, projectId, tasks, decisions, now);
  const risks = detectRisks(
    workspaceId,
    projectId,
    tasks,
    decisions,
    project.targetDate,
    now,
    windowDays,
  );
  const decisionImpacts = await buildDecisionImpacts(workspaceId, decisions);

  const metrics = computeMetrics(tasks, decisions, now, windowDays);
  const health = computeHealth(metrics, {
    highRiskCount: risks.filter((r) => r.level === 'HIGH').length,
    impactedTaskCount: decisionImpacts.reduce((n, i) => n + i.affectedTasks.length, 0),
    now,
  });
  const recommendations = buildRecommendations(
    workspaceId,
    projectId,
    tasks,
    decisions,
    blockers,
    risks,
    decisionImpacts,
    now,
    windowDays,
  );

  // Dismissal hides a signal from THIS user's view only; it is per-(workspace,user), never global.
  const dismissed = await intelligenceRepo.getDismissalKeys(workspaceId, caller.userId);
  const hidden = (kind: string, id: string): boolean => dismissed.has(`${kind}:${id}`);

  return {
    project: {
      id: project.id,
      name: project.name,
      projectKey: project.projectKey,
      status: project.status,
    },
    health,
    blockers: blockers.filter((b) => !hidden('BLOCKER', b.id)),
    risks: risks.filter((r) => !hidden('RISK', r.id)),
    recommendations: recommendations.filter((r) => !hidden('RECOMMENDATION', r.id)),
    decisionImpacts,
  };
}

/** Personal execution intelligence — the caller's own visible work, bucketed + next actions. */
export async function getPersonalIntelligence(
  workspaceId: string,
  caller: IntelligenceCaller,
  windowDays: number = APPROACHING_WINDOW_DAYS,
): Promise<PersonalIntelligence> {
  const rows = await taskService.listMyTasks(workspaceId, caller);
  return buildPersonalIntelligence(workspaceId, caller.userId, rows, Date.now(), windowDays);
}

/** Record (or re-state) a dismissal idempotently — the DB unique key enforces dedup, not this layer. */
export async function recordDismissal(
  workspaceId: string,
  caller: IntelligenceCaller,
  input: CreateDismissalInput,
): Promise<IntelligenceDismissalView> {
  const row = await intelligenceRepo.upsertDismissal(workspaceId, caller.userId, {
    kind: input.kind,
    dedupKey: input.dedupKey,
    state: input.state,
  });
  return {
    kind: row.kind,
    dedupKey: row.dedupKey,
    state: row.state,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Remove a dismissal (un-dismiss) so the signal resurfaces on the next read. */
export async function removeDismissal(
  workspaceId: string,
  caller: IntelligenceCaller,
  input: { kind: CreateDismissalInput['kind']; dedupKey: string },
): Promise<void> {
  await intelligenceRepo.deleteDismissal(workspaceId, caller.userId, input.kind, input.dedupKey);
}
