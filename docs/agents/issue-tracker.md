# Issue tracker: GitHub

Issues and specs for this project live in [diego-valdettaro/gestor-planilla-patty](https://github.com/diego-valdettaro/gestor-planilla-patty). Use the `gh` CLI for all issue operations.

## Conventions

- Create an issue with `gh issue create`.
- Read an issue and its comments with `gh issue view <number> --comments`.
- List issues with `gh issue list`.
- Add discussion with `gh issue comment <number>`.
- Close work with `gh issue close <number>`.

## Issue types

The repository uses these labels as a routing rule:

- `type:epic`: product scope and implementation decisions. Its title starts with `[Epic]`, it does not carry `ready-for-agent`, and no agent executes it with `issue-to-pr`.
- `type:task`: one independently verifiable implementation slice. It links to one parent epic and is the only issue type that `issue-to-pr` may execute.

The labels already exist in GitHub. In a new repository, create them once before publishing the first epic or task:

```powershell
gh label create "type:epic" --description "Product scope; split into child tasks" --color "5319E7" --repo diego-valdettaro/gestor-planilla-patty
gh label create "type:task" --description "Executable child ticket" --color "0E8A16" --repo diego-valdettaro/gestor-planilla-patty
```

## Pull requests as a triage surface

PRs as a request surface: no.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `diego-valdettaro/gestor-planilla-patty`.

`to-spec` publishes an epic with `type:epic`. `to-tickets` publishes child tasks with `type:task`, links each task to its epic, and records blocking edges. `issue-to-pr` only accepts a `type:task` issue.

## Ready frontier

Every task must keep its blockers in this exact, machine-readable form:

```md
## Blocked by

- #123
- #456
```

Use `None (can start immediately)` when there are no blockers. The workflow
`.github/workflows/sincronizar-frontera-issues.yml` owns `ready-for-agent`:
it adds the label only when every listed blocker is closed, removes it if a
blocker reopens, and ignores malformed or untyped issues. Do not set that
label manually.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
