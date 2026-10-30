# bb-plugins

Plugins for [bb](https://getbb.app), the agentic IDE. Each one lives in its own
folder under `plugins/` and installs on its own.

![Omgovich Sidebar with PR numbers and Usage Bars on the left, Omgovich Diffs on the right](docs/overview.png)

<sub>A demo project; no real chats or code.</sub>

| Plugin | What it does |
| --- | --- |
| [Omgovich Sidebar](plugins/cursor-sidebar) | Thread list: projects, nesting, status, a live activity line, the thread's PR and branch in the subline |
| [Omgovich PR Linker](plugins/pr-link) | Each thread's pull request: the PR of its branch, or one attached by hand. Other plugins read it |
| [Omgovich Diffs](plugins/pr-stack-diff) | A side-panel tab to review every PR of the thread's stack, with Viewed marks and notes sent to the agent |
| [Omgovich PR Review](plugins/review-pr) | Start a PR review in its own worktree thread from the sidebar or `bb review-pr` |
| [Omgovich Usage Bars](plugins/usage-bars) | Remaining Claude and Codex usage above the sidebar footer |
| [Omgovich Reconnect Agent](plugins/restart-session) | A Reconnect button in the thread header: fresh agent process, same history, MCP servers reconnect |

Sidebar, Diffs and PR Review show the thread's PR through PR Linker;
install it alongside them.

## Install

Add the collection to bb once, as a plugin marketplace:

```sh
bb marketplace add git:github.com/omgovich/bb-plugins@main
```

The six plugins then show up in bb's plugin store (Settings → Plugins, or
`bb plugin search omgovich`) and install by id:

```sh
bb plugin install pr-link@omgovich
bb plugin install cursor-sidebar@omgovich
```

| Plugin | Id |
| --- | --- |
| Omgovich Sidebar | `cursor-sidebar` |
| Omgovich PR Linker | `pr-link` |
| Omgovich Diffs | `pr-stack-diff` |
| Omgovich PR Review | `review-pr` |
| Omgovich Usage Bars | `usage-bars` |
| Omgovich Reconnect Agent | `restart-session` |

Each one tracks `main`: `bb plugin outdated` shows new commits and
`bb plugin update <id>` applies them. bb builds a plugin on install.

Without the marketplace, install straight from git:

```sh
bb plugin install git:github.com/omgovich/bb-plugins@main --plugin pr-link
```

PR Linker, Diffs and PR Review call the GitHub CLI, so `gh` must be installed
and logged in on the machine that runs bb.

## Limits

- PR Linker, Diffs and PR Review run `git` and `gh` on the machine that runs
  the bb server. Chats whose worktree lives on another enrolled machine show no
  PR there, and PR Review needs the project checked out on the server's machine.
- They read the GitHub repo from the worktree's `origin` remote on
  `github.com`; other hosts and remotes are not looked at.

## Develop

See [AGENTS.md](AGENTS.md).

## License

MIT. Omgovich Sidebar adapts code from
[bb-plugin-cursor-sidebar](https://github.com/wy3z/bb-plugin-cursor-sidebar);
see its [notices](plugins/cursor-sidebar/THIRD-PARTY-NOTICES.md).
