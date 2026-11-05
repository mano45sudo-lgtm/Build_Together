/**
 * Phase 7 Execution Intelligence contracts.
 *
 * The intelligence engine is DETERMINISTIC and EXPLAINABLE: every signal (health, blocker, risk,
 * recommendation) is computed ON READ from real project / task / dependency / decision data the
 * caller is already authorized to see, and each carries the reason + evidence behind it. Nothing here
 * is an arbitrary score or a fabrication — a factor maps to concrete entities (compiled by both the
 * API and the desktop renderer, so the wire shape can never drift; mirrors `projects.ts` / `tasks.ts`).
 *
 * SECURITY: read DTOs only. Authorization is decided server-side on every request (workspace
 * membership + role + project visibility). A client id never widens the data it receives — the repo
 * narrows every aggregate to workspaces/projects the caller can see before a signal is ever computed.
 */

import type { ApiResponse } from './index.js';
import type { MyTaskView, TaskStatus } from './tasks.js';

// ---- Enums (closed vocabularies; mirrored by the API service, never free text) ----

/** The three explainable project-health states (Phase 7 brief §3A). */
export type ProjectHealthState = 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK';

/** A factor's contribution severity. `NONE` marks a positive/neutral observation. */
export type FactorSeverity = 'NONE' | 'ATTENTION' | 'RISK';

/**
 * Stable codes for the deterministic factors that move project health. Exported so validation, the
 * API and the UI agree on the same vocabulary; new factors are added here + the calculation, never as
 * free text. Each code maps to a documented rule in `project-health.service`.
 */
export type HealthFactorCode =
  | 'NO_TASKS'
  | 'ALL_COMPLETE'
  | 'OVERDUE_TASKS'
  | 'BLOCKED_TASKS'
  | 'APPROACHING_DEADLINES'
  | 'DECISIONS_AWAITING_REVIEW'
  | 'AFFECTED_BY_DECISION_REVISION'
  | 'HIGH_RISK_ITEMS';

/** Where a detected blocker came from. Structured sources only (§C — AI suggestions land later). */
export type BlockerSource =
  | 'UNFINISHED_PREREQUISITE'
  | 'OVERDUE_PREREQUISITE'
  | 'AWAITING_DECISION'
  | 'DECISION_NEEDS_REVIEW';

/** A blocker's lifecycle. Only `OPEN` exists for deterministic detection today. */
export type BlockerStatus = 'OPEN';

/** Explainable risk levels (Phase 7 brief §3D). */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** The deterministic signals that raise a risk, each a documented rule in `risk.service`. */
export type RiskSignalCode =
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'LONG_RUNNING'
  | 'BLOCKED'
  | 'PENDING_PREREQUISITE'
  | 'AWAITING_DECISION'
  | 'REPEATED_DUE_DATE_CHANGES';

/** Recommendation urgency. Distinct from a task's own `TaskPriority`. */
export type RecommendationPriority = 'LOW' | 'MEDIUM' | 'HIGH';

/** The kind of entity a recommendation / signal points at, so the renderer can navigate to it. */
export type IntelligenceEntityKind = 'TASK' | 'DECISION' | 'PROJECT';

/** Which computed signal a user's dismissal resolves against (mirrors the DB `InsightKind`). */
export type InsightKind = 'RECOMMENDATION' | 'BLOCKER' | 'RISK';

/** How a signal was taken off view. Neither mutates the underlying record (§E: never auto-execute). */
export type DismissalState = 'DISMISSED' | 'RESOLVED';

// ---- Shared primitives ----

/** A person reference safe for a signal ("responsible", "assignee"). */
export interface IntelligencePerson {
  id: string;
  name: string;
}

/** A machine-routable destination within the app (the renderer maps this to its own navigation). */
export interface IntelligenceDestination {
  kind: IntelligenceEntityKind;
  workspaceId: string;
  projectId: string | null;
  entityId: string;
}

// ---- A. Project health ----

/** One contributing factor behind a health state — the "why", with the concrete evidence count. */
export interface HealthFactor {
  code: HealthFactorCode;
  severity: FactorSeverity;
  /** Human, locale-stable sentence the UI renders directly. */
  label: string;
  /** How many records drove this factor (0 for a positive/neutral observation). */
  count: number;
  /** Up to a handful of entity ids backing the factor, so the claim is checkable, not asserted. */
  evidenceEntityIds: string[];
}

/** Deterministic progress over a project's tasks (completed / total), plus the raw counts. */
export interface ProjectMetrics {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  /** Open tasks due within the upcoming window (see `APPROACHING_DEADLINES`). */
  upcomingDeadlineTasks: number;
  /** Soonest future due date among open tasks, or null. */
  nextDueDate: string | null;
  decisionsAwaitingReview: number;
  /** `completedTasks / totalTasks` (0 when there are no tasks). Documented, not a magic score. */
  completionRatio: number;
}

/** The explainable project health verdict plus every factor behind it. */
export interface ProjectHealth {
  state: ProjectHealthState;
  /** Every factor that fired (highest severity first). Empty ⇒ genuinely nothing needs attention. */
  factors: HealthFactor[];
  metrics: ProjectMetrics;
  /** ISO instant the deterministic snapshot was computed (transient; never persisted). */
  computedAt: string;
}

// ---- C. Blockers ----

/** A structured blocker: what cannot progress, why, who owns it, and the next action. */
export interface Blocker {
  /** Stable dedup key (derived from entity identity + source), reused as the dismissal key. */
  id: string;
  source: BlockerSource;
  status: BlockerStatus;
  description: string;
  projectId: string;
  taskId: string | null;
  responsible: IntelligencePerson | null;
  /** The concrete evidence behind the blocker (e.g. the unfinished prerequisite's title). */
  evidence: string;
  suggestedAction: string;
  destination: IntelligenceDestination;
}

// ---- D. Risk ----

/** An explainable risk on a task (or the project milestone). Never a prediction of certainty. */
export interface RiskSignal {
  id: string;
  level: RiskLevel;
  /** What is at risk (a human sentence naming the entity). */
  what: string;
  /** Why it was flagged — the fired signals, each a documented rule. */
  signals: RiskSignalCode[];
  /** The evidence supporting the assessment (dates, counts, prerequisite titles). */
  evidence: string;
  /** What action could resolve it. */
  recommendedAction: string;
  projectId: string;
  taskId: string | null;
  destination: IntelligenceDestination;
}

// ---- E. Next best actions ----

/** A contextual recommendation. Always evidence-backed; never auto-executed. */
export interface Recommendation {
  id: string;
  /** The imperative the user can take (e.g. "Resolve the blocker on …"). */
  action: string;
  /** Stable machine code for the action kind, so the UI can pick an icon/verb without string parsing. */
  actionCode:
    | 'REVIEW_OVERDUE_TASK'
    | 'RESOLVE_BLOCKER'
    | 'APPROVE_DECISION'
    | 'FOLLOW_UP_DECISION'
    | 'ASSIGN_UNOWNED_TASK'
    | 'REVIEW_AFFECTED_TASK'
    | 'REVIEW_RISK'
    | 'UPDATE_APPROACHING_DEADLINE';
  reason: string;
  evidence: string;
  priority: RecommendationPriority;
  entityKind: IntelligenceEntityKind;
  entityId: string;
  projectId: string | null;
  destination: IntelligenceDestination;
}

/** A user's persisted decision on a computed signal (returned after dismiss/resolve). */
export interface IntelligenceDismissalView {
  kind: InsightKind;
  dedupKey: string;
  state: DismissalState;
  updatedAt: string;
}

/** Input to record a dismissal. `dedupKey` must be a key the engine already emitted. */
export interface CreateDismissalInput {
  kind: InsightKind;
  dedupKey: string;
  state: DismissalState;
}

// ---- §5 Decision intelligence ----

/** A task that may need re-review because a decision it is linked to was revised (superseded). */
export interface DecisionAffectedTask {
  taskId: string;
  title: string;
  status: TaskStatus;
  assignee: IntelligencePerson | null;
  /** Why this task was flagged — the decision revision, not an auto-judgement. */
  reason: string;
}

/** The execution impact of a single revised (superseded) decision. */
export interface DecisionRevisionImpact {
  decisionId: string;
  decisionTitle: string;
  revisedAt: string;
  supersededBy: { id: string; title: string } | null;
  projectId: string | null;
  affectedTasks: DecisionAffectedTask[];
}

// ---- Combined project overview ----

/** Everything the Project Intelligence Overview needs in one round-trip (transient, computed). */
export interface ProjectIntelligenceOverview {
  project: { id: string; name: string; projectKey: string; status: string };
  health: ProjectHealth;
  blockers: Blocker[];
  risks: RiskSignal[];
  recommendations: Recommendation[];
  decisionImpacts: DecisionRevisionImpact[];
}

// ---- §6 Personal execution intelligence ----

/** The "what should I focus on right now?" view, narrowed to the caller's own visible work. */
export interface PersonalIntelligence {
  userId: string;
  overdue: MyTaskView[];
  upcoming: MyTaskView[];
  blocked: MyTaskView[];
  /** Tasks assigned to me still in review. */
  awaitingMyReview: MyTaskView[];
  recommendations: Recommendation[];
}

// ---- Query params ----

/** A project listing query shared by the read-only intelligence endpoints (window tuning). */
export interface IntelligenceQuery {
  /** Days ahead counted as an "approaching deadline" (clamped server-side, default 7). */
  deadlineWindowDays?: number;
}

// ---- Response aliases ----

export type ProjectHealthResponse = ApiResponse<ProjectHealth>;
export type BlockersResponse = ApiResponse<Blocker[]>;
export type RisksResponse = ApiResponse<RiskSignal[]>;
export type RecommendationsResponse = ApiResponse<Recommendation[]>;
export type ProjectIntelligenceResponse = ApiResponse<ProjectIntelligenceOverview>;
export type DecisionImpactsResponse = ApiResponse<DecisionRevisionImpact[]>;
export type PersonalIntelligenceResponse = ApiResponse<PersonalIntelligence>;
export type DismissalResponse = ApiResponse<IntelligenceDismissalView>;
