## Agent skills

## Ralph quality bar

This is production-bound, maintainable code. Keep each issue focused, preserve domain vocabulary, add tests for behavior, and do not commit while tests, typecheck, or build fail. Prefer resolving architectural and integration risks before polish.

## Database validation

Before committing an issue, run `pnpm validate`. It creates a disposable PostgreSQL container, applies every migration, runs tests with `TEST_DATABASE_URL`, typechecks, builds, then removes the container. A skipped PostgreSQL integration test is a failed validation. Do not run tests against the local `planilla` database.

### Issue tracker

Issues and specs for this project live in GitHub Issues at `diego-valdettaro/gestor-planilla-patty`. See `docs/agents/issue-tracker.md`.

### Agent workflow

Use the isolated issue workflow in `docs/agents/agent-workflow.md`.

### Domain docs

The Planilla web app has one domain context. See `docs/agents/domain.md`.

### Design contract

Before changing a user-facing interface, read `docs/agents/diseno.md`. Reuse its
tokens and interaction patterns. Do not add a route, workflow, role, or product
capability unless the current issue or approved product documentation requires it.
