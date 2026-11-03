# Coding Standards

Concise, project-wide. Domain detail lives in the `.claude/skills/*`.

## Language & types

- TypeScript strict mode in every package. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
  on. No `any` except wrapping genuinely untyped boundaries (and those get a typed shim).
- Model external data (API responses, env, SDK events) with explicit types / zod schemas at
  the boundary; infer freely inside typed code.
- Prefer discriminated unions over parallel boolean flags.

## Structure & size

- One responsibility per module. Components/hooks/functions stay small; refactor when a unit
  mixes concerns (no monolithic components, no fat controllers — see the skills).
- Import direction: `web` → `shared`; `api` → `shared`; `shared` imports nothing app-specific.
  No circular imports.

## Naming

- Components: `PascalCase` (`MessageBubble.tsx`). Hooks: `useCamelCase`. Other modules:
  `kebab-case`. Types/interfaces/unions: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Booleans read as predicates (`isActive`, `canEdit`). Events/handlers `onX` / `handleX`.
- Backend layers named by role: `*Controller`, `*Service`, `*Repository`.

## Style

- Prettier is the formatter of record (no style debates in review). ESLint enforces
  correctness and conventions. Run `pnpm format` and `pnpm lint` before committing.
- Prefer early returns and flat control flow; avoid deep nesting.
- Immutability by default (`const`, no reassignment of params); pure functions where possible.

## Comments & docs

- Comments explain _why_ (constraints, trade-offs, gotchas), never restate _what_ the code
  says. No commented-out dead code in commits.
- Every non-obvious public function/module gets a short doc comment.

## Errors & logging

- Never swallow errors. Backend throws typed `AppError`; the single `errorHandler` responds.
  Frontend surfaces errors to the user with recovery, logs with `requestId`.
- No `console.log`/`print` in committed code — use the configured logger (backend) or remove.

## Secrets

- No secret/credential/`.env` in source, commits, bundles or logs. Placeholders only in
  `.env.example`. Enforced by `.gitignore` and the `security-review` skill.

## Dependencies

- Add a dependency only with a stated reason; prefer native/framework solutions. Pin stable
  versions; no deprecated or pre-release packages. Review `pnpm audit` each phase.

## Definition of a clean change

Typecheck + lint + format pass; tests updated/added per `testing-qa`; docs updated if
behavior/architecture changed; conventional commit; no secrets or artifacts committed.
