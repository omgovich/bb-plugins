# Omgovich PR Linker

Each chat's pull request, in one place other plugins can read.

A chat's PR is the PR of its worktree's current branch, found with
`gh pr list --head <branch>`. You can also attach any PR by hand; an attached
PR sticks until you detach it, even when the branch has a PR of its own. bb's
built-in PR status only knows the branch, so a review worktree on a local
branch, or a chat that works on someone else's PR, shows nothing there.

## What you get

- A **Pull request** row in the thread's Info tab, marked "attached" when set by hand.
- `bb pr-link show <thread-id>`, `bb pr-link attach <thread-id> <PR URL or number>`,
  `bb pr-link detach <thread-id>`.
- An RPC other plugins read with `experimental_useRpcKeyedQuery`
  (`pluginId: "pr-link"`, method `pullRequests`, keys = thread ids). Every
  change invalidates `thread:<id>`, so readers refresh on their own.

Omgovich Sidebar, Diffs and PR Review use it.

<p>
  <img src="docs/info-row.png" width="560" alt="Pull request row in the thread Info tab, marked attached">
  <img src="docs/attach-menu.png" width="262" alt="Omgovich Sidebar row menu with Open PR and Attach PR">
</p>

## Requirements

`gh`, logged in, on the machine that runs bb. GitHub is asked at most every 90
seconds per branch or attached PR; chats viewed in the last 10 minutes are
re-checked every minute, so a branch switch shows up without a reload.
