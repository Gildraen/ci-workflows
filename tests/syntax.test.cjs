const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const yaml = require('js-yaml');

for (const directory of ['.github/workflows', 'fixtures/pilot/.github/workflows']) {
  for (const file of readdirSync(directory).filter(name => name.endsWith('.yml'))) {
    test(`valid workflow YAML: ${directory}/${file}`, () => {
      const workflow = yaml.load(readFileSync(`${directory}/${file}`, 'utf8'));
      assert.ok(workflow.on);
      assert.ok(workflow.jobs);
    });
  }
}

for (const file of ['Taskfile.yml', 'fixtures/pilot/Taskfile.yml']) {
  test(`valid Taskfile YAML: ${file}`, () => {
    const taskfile = yaml.load(readFileSync(file, 'utf8'));
    assert.equal(taskfile.version, '3');
    assert.ok(taskfile.tasks.validate);
    assert.ok(taskfile.tasks.test);
  });
}
