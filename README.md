# ci-workflows

Portable reusable GitHub Actions workflows. Each workflow checks out the
calling repository and operates on its files. No DX runtime or local producer
script is required by the reusable workflows.

## Workflows

| Workflow | Inputs and defaults | Consumer contract |
| --- | --- | --- |
| [reusable-validate](.github/workflows/reusable-validate.yml) | `task-name`: string, `validate` | Runs `task ${{ inputs.task-name }}` on Ubuntu, timeout 10 minutes. |
| [reusable-devcontainer-test](.github/workflows/reusable-devcontainer-test.yml) | None | Runs `task test` through `.devcontainer/devcontainer.json`, timeout 20 minutes, `push: never`. |
| [reusable-maintenance](.github/workflows/reusable-maintenance.yml) | `link-check-paths`: string, `docs/**/*.md README.md AGENTS.md`; `link-check-excludes`: string, empty | Runs lychee on Ubuntu, timeout 10 minutes, `--no-progress --exclude-loopback`, `fail: true`. |

All three expose `workflow_call` only, with no outputs or declared secrets.
They do not declare permissions; the caller controls token permissions.
`validate` passes `secrets.GITHUB_TOKEN` to Task setup. Actions are pinned to
full commit SHAs in the workflow files.

### Validate

Task is installed at version `3.53.1`. The cache covers `~/.cache/task` and
`~/.task`, keyed by `${{ runner.os }}-task-${{ hashFiles('Taskfile.yml') }}`
with `${{ runner.os }}-task-` as the restore prefix.

The Task command receives `TASK_REMOTE_TRUSTED_HOSTS=github.com`. This setting
is not applied to the devcontainer test. `task-name` is interpolated directly
into the shell command and must be controlled by the caller; it is not an
untrusted free-text interface. Maintenance inputs are inserted into lychee
arguments as space-separated patterns, not parsed as an array by this workflow.

### Consumer Environment

Validation requires a consumer Taskfile and any tools its task invokes.
Devcontainer tests require a consumer configuration providing Task and its
test dependencies. Maintenance's default globs reference consumer files,
including `AGENTS.md`; callers can override the paths and excludes.

## Local Checks

Requirements: Node.js with `node:test`, npm, Go Task `3.53.1` or later. Install
dependencies with `npm ci`, then run:

```sh
task validate
task test
```

`validate` parses producer and pilot workflow YAML, parses and lists both
Taskfiles, and runs `actionlint` if available. Its absence is reported, not
treated as proof of GitHub Actions validity. `test` checks reusable contracts,
pilot references, Task success/failure, absent tasks/Taskfile, and the trust
environment received by the pilot task.

These checks do not execute actions, build a devcontainer, run lychee, fetch
Remote Taskfiles or establish cross-repository GitHub access.

## Consumer Pilot

[fixtures/pilot](fixtures/pilot/README.md) contains an independent consumer
Taskfile, Dev Container and three `workflow_dispatch` callers targeting
`Gildraen/ci-workflows@feat/component-extraction`. Files under its nested
`.github/workflows` are templates, not active producer workflows. They must
be placed at the root of another repository to execute as consumer workflows.
