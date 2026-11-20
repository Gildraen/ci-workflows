# ci-workflows

Portable reusable GitHub Actions workflows. Each workflow checks out the
calling repository and operates on its files. No DX runtime or local producer
script is required by the reusable workflows.

## Workflows

| Workflow | Inputs and defaults | Consumer contract |
| --- | --- | --- |
| [reusable-validate](.github/workflows/reusable-validate.yml) | `task-name`: string, `validate` | Runs `task ${{ inputs.task-name }}` at the checkout root on Ubuntu, timeout 10 minutes. |
| [reusable-devcontainer-test](.github/workflows/reusable-devcontainer-test.yml) | None | Runs `task test` through `.devcontainer/devcontainer.json`, timeout 20 minutes, `push: never`. |
| [reusable-maintenance](.github/workflows/reusable-maintenance.yml) | `link-check-paths`: string, `docs/**/*.md README.md AGENTS.md`; `link-check-excludes`: string, empty | Runs lychee on Ubuntu, timeout 10 minutes, `--no-progress --exclude-loopback`, `fail: true`. |

All three expose `workflow_call` only, with no outputs or declared secrets.
They do not declare permissions; the caller controls token permissions.
`validate` passes `secrets.GITHUB_TOKEN` to Task setup. Actions and reusable
workflows are pinned to commit SHAs and retain their version tags in comments
for Renovate.

### Validate

Task is installed at version `3.53.1`. The cache covers `~/.cache/task` and
`~/.task`, keyed by `${{ runner.os }}-task-${{ hashFiles('Taskfile.yml') }}`
with `${{ runner.os }}-task-` as the restore prefix.

The Task command receives `TASK_REMOTE_TRUSTED_HOSTS=github.com`. This setting
is not applied to the devcontainer test. `task-name` is interpolated directly
into the shell command and must be controlled by the caller; it is not an
untrusted free-text interface. Maintenance paths are space-separated patterns
passed literally to lychee through a temporary input file, without shell glob
expansion. Exclusion patterns are space-separated and appended literally to
the consumer's `.lycheeignore`, preserving existing exclusions.

### Consumer Environment

Validation requires a consumer Taskfile and any tools its task invokes.
Devcontainer tests require a consumer configuration providing Task and its
test dependencies. Maintenance's default globs reference consumer files,
including `AGENTS.md`; callers can override the paths and excludes.

## Local Checks

Requirements: Bash, Node.js with `node:test`, npm, Go Task `3.53.1` or later. Install
dependencies with `npm ci`, then run:

```sh
task validate
task test
```

`validate` parses the library's workflow YAML, parses and lists its Taskfile,
and runs `actionlint` if available. Its absence is reported, not treated as
proof of GitHub Actions validity. `test` checks reusable workflow contracts,
the producer CI triggers, and literal exclusion handling.

These checks do not execute actions, build a devcontainer, run lychee, fetch
Remote Taskfiles or establish cross-repository GitHub access.

## Releases

After `validate` succeeds on a push to `main`, Release Please opens or updates
a release PR from Conventional Commits. Merge that PR to create the GitHub
Release and a stable tag without `v`; the historical `v` tag remains unchanged.
The baseline is recorded in `version.txt` and
`.release-please-manifest.json`.

Configure `RELEASE_PLEASE_TOKEN` as a fine-grained repository secret so CI runs
automatically on the release PR. GitHub suppresses workflow runs for pull
requests created with `GITHUB_TOKEN`; without the secret, required PR checks
may not run and must be handled before merging.
