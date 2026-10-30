# Working in this repo

A collection of bb plugins, shown in bb as "Omgovich …". Each folder in `plugins/` is a standalone plugin
with its own `package.json`, lockfile and `node_modules`; there is no root
package. `.bb/plugins.json` indexes them so `bb plugin install --plugin <name>`
works from git, and `marketplace.json` lists them as the `omgovich` plugin
marketplace. Keep its `displayName`, `description` and `icon` in step with each
plugin's `package.json`.

## Develop a plugin

```sh
cd plugins/<name>
npm install --include=dev
bb plugin install path:$PWD      # once; moves an install from elsewhere and keeps its settings
bb plugin dev                    # rebuild and reload on save
```

Or by hand: `bb plugin build . && bb plugin reload <id>`. A reload updates the
UI bundle, but an open bb window keeps the old one until it reloads (⌘R).

Check before committing:

```sh
npx tsc --noEmit -p .
npx vitest run                   # plugins with a test/ folder
```

The bb-plugin-authoring skill documents the SDK. `dist/` and `node_modules/`
are not committed: bb builds git and path installs itself.

## Plugin ids

The folder name is the plugin id, and other plugins address it by that id.
Renaming a folder changes the id, and bb then treats it as a new plugin with
empty settings.

## PR Linker's contract

PR Linker (`pr-link`) owns each thread's PR. Sidebar and Diffs keep a copy of its
RPC contract (`src/prLinkContract.ts`) next to the original in
`plugins/pr-link/src/contract.ts`. Method names, schemas and `keyTags` must
match in all three, or invalidations stop reaching the readers. Change them
together.

Sidebar pins an older SDK and reaches newer hooks through
`globalThis.__bbPluginRuntime.pluginSdkApp`; keep that in mind before bumping
it.

## Commits and releases

- One logical change per commit; the subject says what changed for the user.
- No AI attribution in commit messages or PR descriptions.
- Bump the plugin's `version` in its `package.json` when it ships a change.
