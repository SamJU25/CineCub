---
name: verification-loop
description: Quality gates after implementation — build verification, type checks, lint checks, test suite validation, and security scans before finalizing or committing changes.
---

# Verification Loop Skill

A comprehensive verification system for validating code changes before committing or deploying.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR or deployment
- When you want to ensure quality gates pass
- After refactoring or dependency updates

## Verification Phases

### Phase 1: Build Verification
```bash
# Check if project builds
npm run build
# In StreamHeaven storefront:
cd frontend/storefront && npm run build
# In backend-edge:
cd backend-edge && npm run build
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check
```bash
# TypeScript projects / Edge worker
npx tsc --noEmit

# Svelte check (if applicable)
npx svelte-check
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint & Syntax Check
```bash
# Run linter
npm run lint
```

### Phase 4: Test Suite & Diagnostics
```bash
# Run automated tests
npm test

# For StreamHeaven streaming verification:
python .agents/skills/streamheaven-stream-diagnostics/scripts/test_streams.py
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security & Secret Scan
Ensure no secrets, API keys, or credentials were unintentionally added:
- Check for `.env`, `credentials.json`, `token.json`, or hardcoded API tokens in changed files.
- Verify that git diff does not contain tokens, service account keys, or raw cookies.

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git status -s
```

Review each changed file for:
- Unintended changes or formatting churn
- Missing error handling / uncaught promises
- Potential edge cases or regression in existing endpoints

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed)
Security:  [PASS/FAIL] (no secrets leaked)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for deploy / commit

Issues to Fix (if any):
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification after completing milestones or before moving to another layer:
- After modifying a provider or proxy route
- After player UI / playback logic adjustments
- Before deploying to Cloudflare Workers or Render
