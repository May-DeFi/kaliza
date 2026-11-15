# Project memory

## Product intent & audience

- Project appears to be a backend codebase (suggested repo name: `kaliza-backend`).
- Specific product intent and audience not yet stated.

## Brand personality & voice

- Not yet established.

## Visual design & UX direction

- Not applicable (backend project); no UI/design context inferred yet.

## Decisions, constraints & rationale

- **Git CLI unavailable** in this Bolt environment; use Bolt's built-in GitHub integration (GitHub icon → log in → authorize StackBlitz → install app → create repo).
- Repository should be **private**, on `main` branch; Bolt auto-syncs after setup.
- `.gitignore` updated to exclude `dist/` build output so only source/config is pushed.
- Framework tag: `DEFAULT_TO_DEV`.

## Open questions & assumptions

- Assumption: `dist/` is the build output directory.
- Assumption: desired repo name is `kaliza-backend` (not confirmed by user).
- Unknown: whether GitHub connection and repo creation completed successfully.
- Unknown: project's actual purpose, stack, and architecture (not yet described).
- Unknown: preferred branch model, commit conventions, or CI expectations.