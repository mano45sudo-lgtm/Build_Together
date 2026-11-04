import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Layers, Plus } from 'lucide-react';
import { Badge, roleTone } from '../../components/ui/Badge';
import { cn } from '../../lib/cn';
import { useAuth } from '../../state/AuthProvider';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';

/**
 * Active-workspace switcher. Selecting a workspace changes the UI scope; the actual data boundary is
 * still enforced per-request server-side (each call carries the id and re-checks membership/role),
 * so this is a convenience, not a security control.
 */
export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspaceId, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = activeWorkspace?.name ?? 'No workspace';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs text-secondary transition-colors duration-150 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Layers className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="elevation-2 absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-default bg-surface-1 p-1"
        >
          {workspaces.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-muted">You are not in any workspace yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspace?.id;
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveWorkspaceId(ws.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        isActive
                          ? 'bg-surface-2 text-primary'
                          : 'text-secondary hover:bg-surface-2 hover:text-primary',
                      )}
                    >
                      <Check
                        className={cn('size-4 shrink-0', isActive ? 'text-accent' : 'opacity-0')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{ws.name}</span>
                        <span className="block text-2xs text-muted">{ws.memberCount} members</span>
                      </span>
                      <Badge tone={roleTone(ws.role)}>{ws.role}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-1 border-t border-border-subtle pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Plus className="size-4 shrink-0 text-muted" aria-hidden="true" />
              New workspace
            </button>
          </div>
        </div>
      ) : null}

      <CreateWorkspaceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          setActiveWorkspaceId(created.id);
          void refresh();
        }}
      />
    </div>
  );
}
