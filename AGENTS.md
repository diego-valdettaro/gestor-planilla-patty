## Agent skills

## Ralph quality bar

This is production-bound, maintainable code. Keep each issue focused, preserve domain vocabulary, add tests for behavior, and do not commit while tests, typecheck, or build fail. Prefer resolving architectural and integration risks before polish.

## Database validation

The pre-commit hook runs `pnpm validate:commit`: disposable PostgreSQL, migrations,
code/integration tests with `TEST_DATABASE_URL`, and typecheck. It does not build
or run Chromium.

Before publishing the final candidate, run `pnpm validate` once on its final
contents. Repeat it if code, tests, configuration, or dependencies change. It adds
build, demo data, and Chromium tests against that build with `next start`.
`pnpm test:e2e` independently creates its own disposable database and build.
CI keeps the full validation on pull requests and pushes to master.
A skipped PostgreSQL integration test is a failed validation. Do not run tests
against the local `planilla` database.

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
