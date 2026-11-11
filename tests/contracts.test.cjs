const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const checkout = { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' };
const load = name => yaml.load(readFileSync(`.github/workflows/reusable-${name}.yml`, 'utf8'));

test('validate preserves inputs, cache, Task version, trust and command', () => {
  const workflow = load('validate');
  assert.equal(workflow.name, 'reusable-validate');
  assert.deepEqual(workflow.on, { workflow_call: { inputs: {
    'task-name': { description: 'Task to run for the "validate" contract.', type: 'string', default: 'validate' },
  } } });
  assert.deepEqual(workflow.jobs, { validate: {
    'runs-on': 'ubuntu-latest', 'timeout-minutes': 10,
    steps: [checkout, {
      name: 'Cache Task directories',
      uses: 'actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
      with: {
        path: '~/.cache/task\n~/.task\n',
        key: "${{ runner.os }}-task-${{ hashFiles('Taskfile.yml') }}",
        'restore-keys': '${{ runner.os }}-task-\n',
      },
    }, {
      uses: 'go-task/setup-task@a00fbb05ce67b35648be3c78cbc9fd85354c757e',
      with: { version: '3.53.1', 'repo-token': '${{ secrets.GITHUB_TOKEN }}' },
    }, {
      name: 'Run consumer validate contract',
      env: { TASK_REMOTE_TRUSTED_HOSTS: 'github.com' },
      run: 'task ${{ inputs.task-name }}',
    }],
  } });
  assert.equal(workflow.permissions, undefined);
});

test('devcontainer preserves checkout, config, command and no push', () => {
  const workflow = load('devcontainer-test');
  assert.deepEqual(workflow.on, { workflow_call: null });
  assert.deepEqual(workflow.jobs, { test: {
    'runs-on': 'ubuntu-latest', 'timeout-minutes': 20,
    steps: [checkout, {
      name: 'Run task test in the dx devcontainer',
      uses: 'devcontainers/ci@513af61f4de4f75d37e4438f184ba4358f0fc1ca',
      with: { configFile: '.devcontainer/devcontainer.json', push: 'never', runCmd: 'task test' },
    }],
  } });
  assert.equal(workflow.permissions, undefined);
});

test('maintenance preserves defaults and failing lychee invocation', () => {
  const workflow = load('maintenance');
  assert.deepEqual(workflow.on, { workflow_call: { inputs: {
    'link-check-paths': {
      description: 'Glob patterns (space-separated) of files to check for broken links.',
      type: 'string', default: 'docs/**/*.md README.md AGENTS.md',
    },
    'link-check-excludes': {
      description: 'Extra lychee --exclude patterns (space-separated).', type: 'string', default: '',
    },
  } } });
  assert.deepEqual(workflow.jobs, { 'check-links': {
    name: 'Check docs links', 'runs-on': 'ubuntu-latest', 'timeout-minutes': 10,
    steps: [{ ...checkout, with: { submodules: 'recursive' } }, {
      name: 'Check links', uses: 'lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8',
      with: {
        args: '--no-progress --exclude-loopback ${{ inputs.link-check-excludes }} ${{ inputs.link-check-paths }}\n',
        fail: true,
      },
    }],
  } });
  assert.equal(workflow.permissions, undefined);
});

function runTask(taskName, trust, directory = 'fixtures/pilot') {
  const env = { ...process.env, TASK_REMOTE_TRUSTED_HOSTS: trust };
  if (trust === undefined) delete env.TASK_REMOTE_TRUSTED_HOSTS;
  const result = spawnSync('task', ['--dir', directory, taskName], { env, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test('pilot validate receives the exact trust environment', () => {
  assert.equal(runTask('validate', 'github.com').status, 0);
  assert.notEqual(runTask('validate', undefined).status, 0);
  assert.notEqual(runTask('validate', 'example.com').status, 0);
});

test('pilot Task succeeds, propagates failure, and rejects absent contracts', () => {
  assert.equal(runTask('test', undefined).status, 0);
  assert.notEqual(runTask('fail', 'github.com').status, 0);
  const missing = runTask('missing', 'github.com');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /does not exist/);
  const directory = mkdtempSync(join(tmpdir(), 'ci-workflows-'));
  try {
    const absent = runTask('validate', 'github.com', directory);
    assert.notEqual(absent.status, 0);
    assert.match(absent.stderr, /Taskfile/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pilot callers live outside producer workflows and target a fixed version', () => {
  for (const [file, job, workflowName] of [
    ['validate', 'validate', 'validate'],
    ['devcontainer-test', 'test', 'devcontainer-test'],
    ['maintenance', 'check-links', 'maintenance'],
  ]) {
    const caller = yaml.load(readFileSync(`fixtures/pilot/.github/workflows/${file}.yml`, 'utf8'));
    assert.equal(caller.jobs[job].uses,
      `Gildraen/ci-workflows/.github/workflows/reusable-${workflowName}.yml@b8cc1c66c153e49887f0c63baa4a1aa238998b10`);
    assert.equal(caller.permissions.contents, 'read');
    assert.ok(readFileSync(`fixtures/pilot/.github/workflows/${file}.yml`, 'utf8').includes('@b8cc1c66c153e49887f0c63baa4a1aa238998b10 # v0.1.0-rc.1'));
  }
  const container = JSON.parse(readFileSync('fixtures/pilot/.devcontainer/devcontainer.json', 'utf8'));
  assert.equal(container.features['ghcr.io/devcontainers-extra/features/go-task:1'].version, '3.53.1');
  assert.ok(!JSON.stringify(container).includes('gildraen/dx'));
});
