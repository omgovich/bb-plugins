Review a GitHub pull request in its own worktree thread.

## What you get

- A **Review PR** item in the sidebar navigation, under New thread. It opens a
  form for the PR URL and optional extra instructions.
- A `bb review-pr start <url> [instructions...]` command for terminals and agents.

## How it works

The plugin finds the BB project whose origin is the PR's repository, fetches
`pull/<n>/head` into the local branch `review/pr-<n>`, and starts a thread in a
new worktree from that branch. The thread gets the review prompt with the PR's
URL plus your instructions, lands in the **Reviews** sidebar section, and opens.

By default the agent follows the bundled `review-pull-request` skill. The
prompt, agent (provider, model, reasoning, permissions) and section are plugin
settings.
