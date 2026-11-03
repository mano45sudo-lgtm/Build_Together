import { Hammer } from 'lucide-react';

/**
 * Phase 0 engineering scaffold — a deliberate placeholder, not a product screen.
 * Real UI is designed with the Impeccable skill in later phases. This exists only to prove
 * the Vite + React + Tailwind + TypeScript pipeline builds and renders.
 */
export function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-subtle bg-surface-1">
          <Hammer className="size-6 text-accent" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">BuildTogether</h1>
        <p className="text-sm text-secondary">
          Engineering scaffold ready. From Conversation to Completion.
        </p>
      </div>
    </main>
  );
}
