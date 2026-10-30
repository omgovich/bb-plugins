import type { LinkedPr } from "./contract";

/** A PR as `gh pr list/view --json` returns it. */
export interface GhPr {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  reviewDecision?: string | null;
}

export function toLinked(repo: string, pr: GhPr): LinkedPr {
  return {
    repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : pr.isDraft ? "draft" : "open",
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    approved: pr.reviewDecision === "APPROVED",
  };
}

/** The branch's PR: an open one first, else the newest merged or closed. */
export function pickBranchPr(prs: readonly GhPr[]): GhPr | null {
  const open = prs.filter((pr) => pr.state === "OPEN").sort((a, b) => b.number - a.number);
  if (open.length > 0) return open[0]!;
  return [...prs].sort((a, b) => b.number - a.number)[0] ?? null;
}
