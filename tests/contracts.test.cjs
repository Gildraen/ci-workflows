const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const checkout = { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' };
const load = name => yaml.load(readFileSync(`.github/workflows/reusable-${name}.yml`, 'utf8'));

test('validate preserves inputs, cache, Task version, trust and command', () => {
  const workflow = load('validate');
  assert.equal(workflow.name, 'reusable-validate');
  assert.deepEqual(workflow.on, {
    workflow_call: {
      inputs: {
        'task-name': { description: 'Task to run for the "validate" contract.', type: 'string', default: 'validate' },
      }
    }
  });
  assert.deepEqual(workflow.jobs, {
    validate: {
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
    }
  });
  assert.equal(workflow.permissions, undefined);
});

test('devcontainer preserves checkout, config, command and no push', () => {
  const workflow = load('devcontainer-test');
  assert.deepEqual(workflow.on, { workflow_call: null });
  assert.deepEqual(workflow.jobs, {
    test: {
      'runs-on': 'ubuntu-latest', 'timeout-minutes': 20,
      steps: [checkout, {
        name: 'Run task test in the consumer devcontainer',
        uses: 'devcontainers/ci@513af61f4de4f75d37e4438f184ba4358f0fc1ca',
        with: { configFile: '.devcontainer/devcontainer.json', push: 'never', runCmd: 'task test' },
      }],
    }
  });
  assert.equal(workflow.permissions, undefined);
});

test('maintenance preserves defaults and failing lychee invocation', () => {
  const workflow = load('maintenance');
  assert.deepEqual(workflow.on, {
    workflow_call: {
      inputs: {
        'link-check-paths': {
          description: 'Glob patterns (space-separated) of files to check for broken links.',
          type: 'string', default: 'docs/**/*.md README.md AGENTS.md',
        },
        'link-check-excludes': {
          description: 'Extra lychee --exclude patterns (space-separated).', type: 'string', default: '',
        },
      }
    }
  });
  assert.deepEqual(workflow.jobs, {
    'check-links': {
      name: 'Check docs links', 'runs-on': 'ubuntu-latest', 'timeout-minutes': 10,
      steps: [{ ...checkout, with: { submodules: 'recursive' } }, {
        name: 'Add link exclusions',
        if: "inputs.link-check-excludes != ''",
        env: { LINK_CHECK_EXCLUDES: '${{ inputs.link-check-excludes }}' },
        run: 'read -r -a patterns <<< "$LINK_CHECK_EXCLUDES"\nprintf \'\\n\' >> .lycheeignore\nprintf \'%s\\n\' "${patterns[@]}" >> .lycheeignore\n',
      }, {
        name: 'Prepare link inputs',
        id: 'link-inputs',
        env: { LINK_CHECK_PATHS: '${{ inputs.link-check-paths }}' },
        run: 'read -r -a patterns <<< "$LINK_CHECK_PATHS"\ninput_file="$(mktemp "$RUNNER_TEMP/lychee-inputs.XXXXXX")"\nprintf \'%s\\n\' "${patterns[@]}" > "$input_file"\nprintf \'file=%s\\n\' "$input_file" >> "$GITHUB_OUTPUT"\n',
      }, {
        name: 'Check links', uses: 'lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8',
        with: {
          args: "--no-progress --exclude-loopback --files-from '${{ steps.link-inputs.outputs.file }}'\n",
          fail: true,
        },
      }],
    }
  });
  assert.equal(workflow.permissions, undefined);
});

test('maintenance passes literal globs through a file without evaluating checkout filenames', () => {
  const workflow = load('maintenance');
  const steps = workflow.jobs['check-links'].steps;
  const prepare = steps.find(step => step.id === 'link-inputs');
  const check = steps.find(step => step.name === 'Check links');
  const directory = mkdtempSync(join(tmpdir(), 'ci-workflows-paths with spaces-'));
  try {
    mkdirSync(join(directory, 'docs', 'nested', 'deeper'), { recursive: true });
    for (const file of ['docs/root.md', 'docs/nested/one.md', 'docs/nested/deeper/two.md', 'docs/nested/$(touch SENTINEL).md']) {
      writeFileSync(join(directory, file), '');
    }
    const output = join(directory, 'outputs');
    const patterns = workflow.on.workflow_call.inputs['link-check-paths'].default;
    const prepared = spawnSync('bash', ['-eu', '-c', prepare.run], {
      cwd: directory,
      env: { ...process.env, RUNNER_TEMP: directory, GITHUB_OUTPUT: output, LINK_CHECK_PATHS: patterns },
      encoding: 'utf8',
    });
    assert.ifError(prepared.error);
    assert.equal(prepared.status, 0, prepared.stderr);
    const inputFile = readFileSync(output, 'utf8').trim().slice('file='.length);
    assert.equal(readFileSync(inputFile, 'utf8'), 'docs/**/*.md\nREADME.md\nAGENTS.md\n');
    const args = check.with.args.replace('${{ steps.link-inputs.outputs.file }}', inputFile);
    const invocation = spawnSync('bash', ['-eu', '-c', 'lychee() { printf "%s\\0" "$@"; }; eval lychee ${INPUT_ARGS}'], {
      cwd: directory,
      env: { ...process.env, INPUT_ARGS: args },
      encoding: 'utf8',
    });
    assert.ifError(invocation.error);
    assert.equal(invocation.status, 0, invocation.stderr);
    assert.deepEqual(invocation.stdout.split('\0').slice(0, -1),
      ['--no-progress', '--exclude-loopback', '--files-from', inputFile]);
    assert.equal(existsSync(join(directory, 'SENTINEL')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('maintenance appends literal exclusion patterns and preserves consumer exclusions', () => {
  const step = load('maintenance').jobs['check-links'].steps.find(step => step.name === 'Add link exclusions');
  const directory = mkdtempSync(join(tmpdir(), 'ci-workflows-excludes-'));
  try {
    writeFileSync(join(directory, '.lycheeignore'), '^https://existing[.]invalid');
    const patterns = ['^https://example[.]invalid/.*', '^https://other[.]invalid/$(false)'];
    const result = spawnSync('bash', ['-eu', '-c', step.run], {
      cwd: directory,
      env: { ...process.env, LINK_CHECK_EXCLUDES: patterns.join(' ') },
      encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(directory, '.lycheeignore'), 'utf8'),
      `^https://existing[.]invalid\n${patterns.join('\n')}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('producer CI validates the library on main and pull requests', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/validate.yml', 'utf8'));
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.ok(Object.hasOwn(workflow.on, 'pull_request'));
  assert.equal(workflow.on.pull_request, null);
  assert.deepEqual(Object.keys(workflow.jobs), ['validate']);
  assert.equal(workflow.jobs.validate.if, undefined);
  for (const command of ['npm ci', 'task validate && task test']) {
    const step = workflow.jobs.validate.steps.find(step => step.run === command);
    assert.ok(step, `Producer CI must run ${command}`);
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
  }
});
