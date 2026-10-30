---
name: review-pull-request
description: Review a GitHub pull request that is checked out in the current worktree and report findings ranked by severity. Use when a thread started by Omgovich PR Review asks for a review, or the user asks to review the PR in this worktree.
---

# Review a pull request

The worktree is already on the PR's head (a local `review/pr-<n>` branch).
Review it; do not fix it.

## 1. Understand the change

- `gh pr view <url> --json title,body,baseRefName,headRefName,author,files`
  for what the PR claims to do and its base branch.
- `git diff --stat origin/<base>...HEAD` and then the full diff, file by file.
  If `origin/<base>` is stale, `git fetch origin <base>` first.
- Read the surrounding code, not only the hunks: callers, the types that flow
  in, the tests that cover it, and the project's own rules (AGENTS.md,
  CLAUDE.md, CONTRIBUTING).

## 2. Look for real problems

In order of weight:

1. Correctness: wrong logic, missed cases, broken invariants, races, error
   paths that lose data or crash.
2. Security: injection, missing authorization, secrets, unsafe input.
3. Contracts: API, schema or migration changes that break callers or old data.
4. Tests: changed behavior with no test, or tests that cannot fail.
5. Simplicity and fit: duplication of existing helpers, needless abstraction,
   naming that hides intent.

Skip style a formatter or linter would catch.

## 3. Verify before reporting

For every finding, confirm it against the code: trace the input that triggers
it, or run the relevant test or a quick script. Drop what you cannot back up.
Run the project's typecheck and tests when they are cheap.

## 4. Report

Findings ranked by severity: **blocker**, **should fix**, **nit**. Each one
has `path:line`, what is wrong, and a concrete scenario where it bites. Then a
one-paragraph verdict and what you ran to verify.

Do not post comments on GitHub, push, or edit files unless the user asks.
