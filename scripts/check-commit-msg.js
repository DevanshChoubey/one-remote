#!/usr/bin/env node
// Conventional Commits check, run by the lefthook commit-msg hook.
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: check-commit-msg.js <commit-msg-file>');
  process.exit(2);
}
const subject = (fs.readFileSync(file, 'utf8').split('\n')[0] ?? '').trim();
const isGenerated = /^(Merge|Revert|fixup!|squash!)/.test(subject);
const pattern = /^(feat|fix|chore|docs|test|refactor|perf|build|ci|style)(\([a-z0-9-]+\))?!?: .+/;
if (!isGenerated && !pattern.test(subject)) {
  console.error(
    `Commit subject must follow Conventional Commits, e.g. "feat(search): add fuzzy match".\nGot: "${subject}"`,
  );
  process.exit(1);
}
