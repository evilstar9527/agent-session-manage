import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToClaudeProjectBucket } from './paths.js';

test('pathToClaudeProjectBucket matches Claude Code project directory naming', () => {
  assert.equal(
    pathToClaudeProjectBucket('/Users/jishihe/.superset/worktrees/38b2a1ba-02c0-4aa9-b9fe-ef6fadec7424/feature/billing_dev'),
    '-Users-jishihe--superset-worktrees-38b2a1ba-02c0-4aa9-b9fe-ef6fadec7424-feature-billing-dev',
  );
});
