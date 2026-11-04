import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcOutcome, MemberSummary, TaskDependencies, TaskView } from '@buildtogether/shared';
import { TasksPanel } from '../features/tasks/TasksPanel';

/**
 * Renderer tests for the Phase 5 Tasks surface (brief §9 desktop). Outside Electron there is no real
 * IPC, so `window.bt` is replaced by a controllable double whose calls the components make through the
 * `data.ts` layer. These prove the UI's OWN guarantees — it renders only what the server returned,
 * drives every mutation through the bridge (never local-only), reflects optimistic Kanban moves and
 * ROLLED-BACK failures honestly, and never fabricates a task list when the bridge errors. No component
 * is faked: the real TasksPanel / TaskDetail / CreateTaskDialog are mounted.
 */

const members: MemberSummary[] = [
  {
    userId: 'u_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatarUrl: null,
    role: 'OWNER',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    userId: 'u_2',
    name: 'Peter Peer',
    email: 'peter@example.com',
    avatarUrl: null,
    role: 'MEMBER',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
];

function makeTask(over: Partial<TaskView> = {}): TaskView {
  return {
    id: 't_1',
    workspaceId: 'w_1',
    projectId: 'p_1',
    title: 'Draft the landing page',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    createdBy: { id: 'u_1', name: 'Ada Lovelace' },
    assignee: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    blocked: false,
    ...over,
  };
}

const ok = <T,>(data: T): Promise<IpcOutcome<T>> => Promise.resolve({ ok: true, data });
const fail = <T,>(message = 'boom'): Promise<IpcOutcome<T>> =>
  Promise.resolve({ ok: false, error: { code: 'SERVER_ERROR', message } });

let tasks: TaskView[] = [];

function installBridge() {
  const bridge = {
    members: { list: () => ok(members) },
    tasks: {
      list: () => ok(tasks),
      create: vi.fn(() => ok(makeTask({ id: 't_new', title: 'Brand new task' }))),
      get: vi.fn(((_ws: string, id: string) =>
        ok(tasks.find((t) => t.id === id) ?? makeTask({ id }))) as never),
      update: vi.fn(((_ws: string, _id: string, input: Partial<TaskView>) =>
        ok({ ...makeTask(), ...input })) as never),
      remove: vi.fn(() => ok(null)),
      assign: vi.fn(((_ws: string, _id: string, input: { assigneeId: string | null }) =>
        ok({
          ...makeTask(),
          assignee: input.assigneeId
            ? { id: input.assigneeId, name: 'Peter Peer', avatarUrl: null }
            : null,
        })) as never),
      changeStatus: vi.fn(() =>
        ok(makeTask({ status: 'DONE', completedAt: '2026-02-02T00:00:00.000Z' })),
      ),
      dependencies: vi.fn(() => ok<TaskDependencies>({ taskId: 't_1', dependsOn: [], blocks: [] })),
      addDependency: vi.fn(() =>
        ok<TaskDependencies>({ taskId: 't_1', dependsOn: [], blocks: [] }),
      ),
      removeDependency: vi.fn(() =>
        ok<TaskDependencies>({ taskId: 't_1', dependsOn: [], blocks: [] }),
      ),
      activity: vi.fn(() => ok([])),
      assignedToMe: vi.fn(() => ok([])),
    },
  } as unknown as NonNullable<typeof window.bt>;
  Object.defineProperty(window, 'bt', { value: bridge, configurable: true, writable: true });
  return bridge;
}

function renderPanel(props: Partial<Parameters<typeof TasksPanel>[0]> = {}) {
  return render(
    <TasksPanel
      workspaceId="w_1"
      projectId="p_1"
      members={members}
      userId="u_1"
      canManage
      loadingMembers={false}
      {...props}
    />,
  );
}

let bridge: ReturnType<typeof installBridge>;

beforeEach(() => {
  tasks = [];
  bridge = installBridge();
});

afterEach(() => {
  Object.defineProperty(window, 'bt', { value: undefined, configurable: true, writable: true });
});

describe('tasks panel', () => {
  it('renders the server-returned tasks as a compact table (title, status, priority, assignee, due)', async () => {
    tasks = [
      makeTask({
        id: 't_1',
        title: 'Design system audit',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assignee: { id: 'u_1', name: 'Ada Lovelace', avatarUrl: null },
      }),
      makeTask({ id: 't_2', title: 'Unassigned chore', assignee: null }),
    ];
    renderPanel();

    const table = await screen.findByRole('table');
    // Scope cell assertions to the table so toolbar filter <option>s cannot double-match.
    expect(within(table).getByText('Design system audit')).toBeInTheDocument();
    expect(within(table).getByText('In Progress')).toBeInTheDocument();
    expect(within(table).getByText('High')).toBeInTheDocument();
    expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
    // A task with no assignee is shown explicitly as unassigned (brief §7).
    expect(within(table).getByText('Unassigned')).toBeInTheDocument();
    // Table headers prove the column contract.
    for (const col of ['Task', 'Status', 'Priority', 'Assignee', 'Due']) {
      expect(within(table).getByRole('columnheader', { name: col })).toBeInTheDocument();
    }
  });

  it('shows the empty state when a project has no tasks yet', async () => {
    tasks = [];
    renderPanel();
    expect(await screen.findByText(/No tasks yet/i)).toBeInTheDocument();
  });

  it('surfaces an honest error and retry rather than a fake list when the bridge fails', async () => {
    bridge.tasks.list = vi.fn(() => fail('network down')) as never;
    renderPanel();
    expect(await screen.findByText(/Could not load tasks/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText('Draft the landing page')).not.toBeInTheDocument();
  });

  it('creates a task with only a title through the bridge (required-fields-only quick create)', async () => {
    tasks = [makeTask({ id: 't_1' })];
    renderPanel();
    await screen.findByText('Draft the landing page');

    fireEvent.click(screen.getByRole('button', { name: /new task/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/title/i), {
      target: { value: 'Brand new task' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /create task/i }));

    await waitFor(() =>
      expect(bridge.tasks.create).toHaveBeenCalledWith(
        'w_1',
        'p_1',
        expect.objectContaining({ title: 'Brand new task', status: 'TODO', priority: 'MEDIUM' }),
      ),
    );
  });

  it('moves a task on the Kanban board and persists the change through the status endpoint', async () => {
    tasks = [makeTask({ id: 't_1', title: 'Ship notes', status: 'TODO' })];
    renderPanel();
    await screen.findByText('Ship notes');

    fireEvent.click(screen.getByRole('tab', { name: /board/i }));
    const mover = await screen.findByLabelText('Move Ship notes');
    fireEvent.change(mover, { target: { value: 'DONE' } });

    await waitFor(() =>
      expect(bridge.tasks.changeStatus).toHaveBeenCalledWith('w_1', 't_1', { status: 'DONE' }),
    );
  });

  it('rolls back an optimistic Kanban move and shows recovery feedback when the write fails', async () => {
    tasks = [makeTask({ id: 't_1', title: 'Fragile card', status: 'TODO' })];
    bridge.tasks.changeStatus = vi.fn(() => fail('server rejected the move')) as never;
    renderPanel();
    await screen.findByText('Fragile card');

    fireEvent.click(screen.getByRole('tab', { name: /board/i }));
    const mover = await screen.findByLabelText('Move Fragile card');
    fireEvent.change(mover, { target: { value: 'DONE' } });

    expect(await screen.findByText(/Update failed/i)).toBeInTheDocument();
    expect(screen.getByText('server rejected the move')).toBeInTheDocument();
    // The optimistic move is undone — the card's control reflects its original To Do status again.
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLSelectElement>('Move Fragile card').value).toBe('TODO'),
    );
    expect(bridge.tasks.changeStatus).toHaveBeenCalled();
  });

  it('assigns a task from the detail view through the assign endpoint', async () => {
    tasks = [makeTask({ id: 't_1', title: 'Owned later', assignee: null })];
    renderPanel();
    fireEvent.click(await screen.findByText('Owned later'));

    const detail = await screen.findByRole('combobox', { name: /assignee/i });
    fireEvent.change(detail, { target: { value: 'u_2' } });

    await waitFor(() =>
      expect(bridge.tasks.assign).toHaveBeenCalledWith('w_1', 't_1', { assigneeId: 'u_2' }),
    );
  });

  it('displays dependencies and the blocked banner in the detail view', async () => {
    tasks = [makeTask({ id: 't_2', title: 'Build components', blocked: true })];
    bridge.tasks.dependencies = vi.fn(() =>
      ok<TaskDependencies>({
        taskId: 't_2',
        dependsOn: [
          { id: 'd_1', task: { id: 't_1', title: 'Design system audit', status: 'TODO' } },
        ],
        blocks: [],
      }),
    ) as never;
    renderPanel();
    fireEvent.click(await screen.findByText('Build components'));

    // The derived blocked state is surfaced, and the blocking prerequisite is shown + navigable.
    expect(await screen.findByText(/waiting on an unfinished prerequisite/i)).toBeInTheDocument();
    expect(screen.getByText('Blocked by')).toBeInTheDocument();
    // The blocking prerequisite is displayed by title and is navigable/removable (a control with a
    // stable, specific aria-label proves the dependency row rendered as an interactive edge).
    expect(screen.getByText('Design system audit')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove dependency Design system audit' }),
    ).toBeInTheDocument();
  });
});
