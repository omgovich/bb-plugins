import { createHash } from "node:crypto";
import { gh, git } from "./host";

/** Read the pushed PR with whitespace hidden, independently of local branches. */
export async function githubDiff({
  worktree,
  repo,
  originRepo,
  number,
  baseRef,
  baseOid,
}: {
  worktree: string | null;
  repo: string;
  originRepo: string | null;
  number: number;
  baseRef: string;
  baseOid?: string;
}): Promise<{ patch: string; whitespaceHidden: boolean }> {
  // Private refs avoid FETCH_HEAD races between panels, and do not move the
  // agent's branches or origin's tracking refs. Include the repo for attachments.
  const namespace = createHash("sha256")
    .update(repo)
    .digest("hex")
    .slice(0, 16);
  const prefix = `refs/pr-stack-diff/${namespace}/${number}`;
  try {
    if (worktree === null)
      throw new Error("No worktree available to fetch this PR.");
    await git(worktree, [
      "fetch",
      "--no-tags",
      "--no-write-fetch-head",
      originRepo === repo ? "origin" : `https://github.com/${repo}.git`,
      `+pull/${number}/head:${prefix}/head`,
      `+${baseOid || `refs/heads/${baseRef}`}:${prefix}/base`,
    ]);
  } catch {
    // Keep remote-only and offline/fetch-restricted chats usable. gh has no -w
    // equivalent, so this is only the existing fallback when fetching fails.
    return {
      patch: await gh([
        "pr",
        "diff",
        String(number),
        "-R",
        repo,
        "--color",
        "never",
      ]),
      whitespaceHidden: false,
    };
  }
  // Resolve both refs in one command before diffing: a later fetch cannot move
  // the endpoints of this request. Diff errors retain normal error behaviour.
  const [head, base] = (
    await git(worktree!, ["rev-parse", `${prefix}/head`, `${prefix}/base`])
  )
    .trim()
    .split("\n");
  return {
    patch: await git(worktree!, [
      "diff",
      "-w",
      "--no-color",
      "--find-renames",
      `${base}...${head}`,
      "--",
    ]),
    whitespaceHidden: true,
  };
}
