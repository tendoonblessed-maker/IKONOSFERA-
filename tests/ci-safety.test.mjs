import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');

test('CI token has explicit read-only repository permissions', () => {
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(workflow, /^\s+(?:actions|contents|deployments|issues|packages|pull-requests|statuses|workflows):\s*write\s*$/m);
});

test('CI verification has a bounded runtime', () => {
  const match = workflow.match(/^\s+timeout-minutes:\s*(\d+)\s*$/m);
  assert.ok(match, 'CI job must define timeout-minutes');
  const minutes = Number(match[1]);
  assert.ok(minutes >= 5 && minutes <= 30, 'CI timeout must be between 5 and 30 minutes');
});

test('CI retains typecheck, lint, tests and production build', () => {
  for (const command of ['npm run typecheck', 'npm run lint', 'npm test', 'npm run build']) {
    assert.ok(workflow.split('\n').some((line) => line.trim() === `- run: ${command}`), `missing CI step: ${command}`);
  }
});

test('CI does not run privileged pull_request_target or workflow_run triggers', () => {
  assert.doesNotMatch(workflow, /^\s*(?:pull_request_target|workflow_run):/m);
});

test('CI jobs cannot override read-only token permissions', () => {
  // The workflow grants permissions at the root; job-level overrides could undo that policy.
  assert.equal((workflow.match(/^permissions:\s*$/gm) ?? []).length, 1);
  assert.doesNotMatch(workflow, /^\s+permissions\s*:/m);
});

test('CI continues to run on pushes and pull requests targeting main or dev', () => {
  assert.match(workflow, /^on:\s*\n\s{2}push:\s*\n\s{2}pull_request:\s*\n\s{4}branches:\s*\[main, dev\]\s*$/m);
});

test('CI installs dependencies before running all verification commands', () => {
  const steps = workflow.split('\n').map((line) => line.trim());
  const install = steps.indexOf('- run: npm install --no-audit --no-fund');
  assert.ok(install >= 0, 'CI must install dependencies');
  for (const command of ['npm run typecheck', 'npm run lint', 'npm test', 'npm run build']) {
    const index = steps.indexOf(`- run: ${command}`);
    assert.ok(index > install, `${command} must run after dependency installation`);
  }
});

test('CI checkout does not persist GitHub credentials in the working tree', () => {
  assert.match(workflow, /^\s{6}- uses: actions\/checkout@v4\s*\n\s{8}with:\s*\n\s{10}persist-credentials:\s*false\s*$/m);
});

test('CI cancels only superseded runs for the same event and ref', () => {
  assert.match(workflow, /^concurrency:\s*\n\s{2}group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}\s*\n\s{2}cancel-in-progress:\s*true\s*$/m);
});

test('CI configures the supported Node runtime before installing dependencies', () => {
  const steps = workflow.split('\n').map((line) => line.trim());
  const setup = steps.indexOf('- uses: actions/setup-node@v4');
  const install = steps.indexOf('- run: npm install --no-audit --no-fund');
  assert.ok(setup >= 0 && setup < install, 'setup-node must run before npm install');
  assert.match(workflow, /^\s{6}- uses: actions\/setup-node@v4\s*\n\s{8}with:\s*\n\s{10}node-version:\s*['"]?24['"]?\s*$/m);
});

function hasFailureMasking(source) {
  // Check the entire workflow so YAML block scalars (run: |) are covered too.
  return /(?:^|\n|;|&&|\(|\brun:\s*)\s*(?:set\s+\+e|set\s+\+o\s+errexit)(?=\s|[;#]|$)/im.test(source)
    || /^\s*continue-on-error:\s*(?:true|[\x27"]true[\x27"]|\$\{\{\s*true\s*\}\})\s*(?:#.*)?$/im.test(source)
    || /\|\|\s*(?:\(\s*)?(?:echo|printf)\b/im.test(source)
    || /\|\|\s*\{\s*(?:true|:|exit\s+0|return\s+0)\s*;?\s*\}(?=\s|[;#)&|]|$)/im.test(source)
    || /(?:\|\|\s*(?:true|:|exit\s+0|return\s+0|\(\s*(?:true|:|exit\s+0|return\s+0)\s*\))|;\s*exit\s+0)(?=\s|[;#)&|]|$)/im.test(source);
}

test('CI verification steps cannot silently ignore failures', () => {
  assert.equal(hasFailureMasking(workflow), false, 'CI commands must propagate failures');
});

test('CI failure masking guard catches multiline run blocks', () => {
  for (const unsafe of [
    '      - run: npm test || true',
    '      - run: |\n          npm test || true',
    '      - run: |\n          npm test; exit 0',
    '      - run: npm test\n        continue-on-error: true',
    '      - run: npm test\n        continue-on-error: True',
    '      - run: npm test\n        continue-on-error: "true"',
    '      - run: npm test\n        continue-on-error: ${{ true }}',
    '      - run: npm test || :',
    '      - run: npm test || TRUE',
    '      - run: npm test || EXIT 0',
    '      - run: |\n          npm test; EXIT 0',
    '      - run: npm test || true; echo done',
    '      - run: |\n          npm test || exit 0; echo ignored',
    '      - run: npm test || true # ignored',
    '      - run: (npm test || true)',
    '      - run: (npm test || exit 0)',
    '      - run: (npm test || :)',
    '      - run: |\n          set +e\n          npm test',
    '      - run: |\n          set +o errexit; npm test',
    '      - run: set +e; npm test',
    '      - run: npm run lint; set +e; npm test',
    '      - run: |\n          echo preparing; set +o errexit; npm test',
    '      - run: npm test && set +e; npm run build',
    '      - run: (set +e; npm test)',
    '      - run: npm test && (set +o errexit; npm run build)',
    '      - run: npm test || return 0',
    '      - run: npm test || RETURN 0',
    '      - run: npm test || (return 0)',
    '      - run: npm test || (exit 0)',
    '      - run: npm test || echo ignored',
    '      - run: npm test || (echo ignored)',
    '      - run: |\n          npm test || (printf ignored)',
    '      - run: |\n          npm test || printf ignored',
    '      - run: npm test || ECHO ignored',
    '      - run: npm test || { true; }',
    '      - run: npm test || { exit 0; }',
    '      - run: npm test || { return 0; }',
    '      - run: npm test || (true)',
    '      - run: npm test || (:)',
    '      - run: |\n          npm test || exit 0',
  ]) {
    assert.equal(hasFailureMasking(unsafe), true, `missed failure masking: ${unsafe}`);
  }
  assert.equal(hasFailureMasking('      - run: |\n          npm test\n          npm run build'), false);
  assert.equal(hasFailureMasking('      - run: npm test || { false; }'), false);
});

test('CI verification steps are not disabled by constant-false conditions', () => {
  // A present but skipped verification command is not a successful CI gate.
  const disabled = /^\\s*if:\\s*(?:false|['"]false['"]|\\$\\{\\{\\s*false\\s*\\}\\})\\s*(?:#.*)?$/im;
  assert.doesNotMatch(workflow, disabled);
  for (const condition of ['if: false', 'if: FALSE', 'if: "false"', 'if: ${{ false }}']) {
    assert.match('      ' + condition, disabled, `missed disabled CI step: ${condition}`);
  }
  assert.doesNotMatch('      if: ${{ success() }}', disabled);
});

test('CI pins the Ubuntu runner image to avoid unexpected OS upgrades', () => {
  assert.match(workflow, /^\s{4}runs-on:\s*ubuntu-24\.04\s*$/m);
  assert.doesNotMatch(workflow, /^\s+runs-on:\s*ubuntu-latest\s*$/m);
});
