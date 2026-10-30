/**
 * The ref a local branch is diffed against. Agent worktrees rebase onto
 * `origin/<base>` and rarely move the local base branch, so a local base that
 * is behind its remote would pull upstream commits into the diff. A local
 * stack parent that is up to date (or ahead) stays local.
 */
export function chooseBase(
  base: string,
  refs: { hasLocal: boolean; hasRemote: boolean; localBehindRemote: boolean },
): string {
  if (refs.hasLocal && !(refs.hasRemote && refs.localBehindRemote)) return base;
  return refs.hasRemote ? `origin/${base}` : base;
}
