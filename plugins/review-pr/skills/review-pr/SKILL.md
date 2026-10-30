---
name: review-pr
description: Start a review of a GitHub pull request in its own BB worktree thread with `bb review-pr`. Use when the user asks to review a PR in a separate thread or worktree, or to hand a PR review off to a new agent.
---

# Review PR

`bb review-pr start <pull request URL> [extra instructions...]` finds the BB project
whose origin is the PR's repository, fetches the PR head into the local branch
`review/pr-<n>`, and starts a new thread in a fresh worktree from it. That
thread gets the plugin's review prompt with the PR's URL (by default: follow the
`review-pull-request` skill), then the extra instructions, and lands in the
"Reviews" sidebar section. `bb plugin config review-pr` shows the prompt,
agent and section.

- Pass the full `https://github.com/OWNER/REPO/pull/NUMBER` URL.
- Quote extra instructions that contain shell characters.
- `--json` prints `{"threadId", "title"}`; wait on the review with
  `bb thread wait <threadId>`.
- It fails when no BB project has the PR's repository as its origin.
