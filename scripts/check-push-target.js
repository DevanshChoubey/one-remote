#!/usr/bin/env node
// Blocks pushes to main, run by the lefthook pre-push hook. Changes reach main through a pull
// request. GitHub only enforces branch protection on private repos with a paid plan, so this
// guards the author's own pushes until the repo goes public and main is protected there.
const PROTECTED = 'refs/heads/main';

/** Pre-push stdin lines are "<local ref> <local sha> <remote ref> <remote sha>". */
function pushesToMain(stdin) {
  return stdin
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[2])
    .some((remoteRef) => remoteRef === PROTECTED);
}

if (require.main === module) {
  const stdin = require('fs').readFileSync(0, 'utf8');
  if (pushesToMain(stdin)) {
    console.error('Pushing to main is blocked. Push a branch and open a pull request instead.');
    process.exit(1);
  }
}

module.exports = { pushesToMain };
