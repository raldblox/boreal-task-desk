# Brief: one operation registry for MCP, REST, A2A and the docs

For: the most capable model (see "Who does what" in `CLAUDE.md`). Read `CLAUDE.md`, `apps/web/src/server/mcp.ts`, `apps/web/src/server/a2a.ts`, the routes under `apps/web/src/app/api/v1/`, and `apps/web/src/content/agent-guide.ts` first.

## Why

Agents are boreal.work's main customers, and they reach it three ways: MCP, REST and A2A. Each operation is written by hand in several places. Adding `get_review_proof` this week meant editing **five files**: the MCP tool, a REST route, the A2A exclusion list, the guide's text and the guide's tools table. Today parity holds only because someone remembers. As tools grow (vaults, rails, currencies, scoped keys), the surfaces will drift, and an agent reading the guide will call things that don't exist, or with the wrong arguments.

## What to build

**1. One registry of operations.** Each operation is defined once:

- its name, title and description (the MCP tool description);
- its input schema (zod), and its output shape;
- who may call it (no key, a requester key, and later scopes);
- whether it writes;
- its REST method and path;
- the add-on part it needs, if any;
- its handler, calling the desk.

**2. Every surface generated from it:**

- the MCP tools (`registerTools`);
- the REST routes. One catch-all under `/api/v1` is fine if Next.js 16 allows it cleanly; otherwise generated thin route files. Read `apps/web/AGENTS.md` and the Next docs first.
- A2A: the action dispatch, and which actions answer with a `Task`;
- an **OpenAPI 3.1 spec** served at `/api/v1/openapi.json`;
- the tools table in agents.md, plus each operation's line in the guide where it belongs.

**3. Parity tests:** every registered operation is reachable on MCP, REST and A2A with the same schema. The guide's table matches the registry. An add-on that's off hides its operations on every surface.

**4. Ready for what's next:** scoped agent keys, where an owner grants "post and fund, but not dispute". Design the registry so scopes slot in, and implement them if time allows. Keys stay hashed, as today.

## Rules

- No change to any operation's name, arguments, output or errors: agents in the wild depend on them. Pin today's behaviour with tests first, then move it.
- Error codes and their HTTP statuses stay as they are (`STATUS` in `apps/web/src/server/desk.ts`).
- Everything in `CLAUDE.md` holds; pages read sessions inside `<Suspense>`.
- Commit on `main` in the main checkout in reviewable steps, each passing `pnpm typecheck` and `pnpm test`. Don't push.
- The guide's wording stays the same unless it was wrong; suggested rewrites go to `docs/handoff.md`.

## Done looks like

- Adding an operation means editing one file, and a test fails when any surface or the guide falls out of step.
- `/api/v1/openapi.json` valid and complete.
- Every existing MCP, REST and A2A test still passing, with the parity tests added.
- A summary of what changed, what was tested, and the risks left.
