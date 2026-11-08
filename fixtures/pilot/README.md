# CI workflows pilot

Independent consumer fixture with a Taskfile, a Dev Container and three
manually dispatched workflows calling `Gildraen/ci-workflows`.

The validate contract checks the trust environment and consumer configuration.
The test contract checks files in the consumer checkout. The `fail` task exits
with an error; `missing` is deliberately not defined.

[Fixture instructions](AGENTS.md). [Consumer contracts](docs/contracts.md).

## GitHub Execution

The producer branch must be published before these callers can resolve it.
The contents of this fixture belong at the root of a separate consumer
repository, for example `Gildraen/ci-workflows-consumer-pilot`. Its three YAML
files belong in that repository's `.github/workflows`, not in the producer's
active workflow directory. No DX Feature or runtime is used by this fixture.

The consumer workflows must exist on its default branch for manual dispatch
discovery. The consumer repository must allow these reusable workflows, and
the producer's Actions access settings must permit that consumer.

```sh
gh workflow run validate.yml --repo Gildraen/ci-workflows-consumer-pilot --ref main -f task-name=validate
gh workflow run devcontainer-test.yml --repo Gildraen/ci-workflows-consumer-pilot --ref main
gh workflow run maintenance.yml --repo Gildraen/ci-workflows-consumer-pilot --ref main
```

Expected nominal results: validate sees `github.com` and the consumer's config;
the devcontainer installs Task and runs the consumer's `test` contract; lychee
checks the consumer documentation. These are expected results, not recorded
executions. Inspect checkout logs and repository paths in all three runs.

Negative validation calls select `task-name=fail` or `task-name=missing` and
must fail. A consumer branch without its Taskfile must also fail validation.
For devcontainer failure, change the consumer's `test` command to `false` on a
test branch and dispatch that ref. For maintenance failure, add a broken local
Markdown link on a test branch and dispatch that ref. Restore the consumer
fixtures after each negative scenario.

Dispatches targeting DX instead of a standalone pilot use the same reusable
references, but DX's own Taskfile, devcontainer and documentation. Publication
and dispatch are separate from local fixture checks.
