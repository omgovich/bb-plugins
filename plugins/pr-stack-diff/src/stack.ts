export interface PrInfo {
  number: number;
  title: string;
  headRefName: string;
  baseRefName: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  headRefOid: string;
  baseRefOid?: string;
  reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
}

export interface StackEntry {
  /** Null for a branch that has no pull request yet. */
  number: number | null;
  title: string;
  headRef: string;
  baseRef: string;
  state: "open" | "draft" | "merged" | "closed" | "local";
  approved: boolean;
}

/**
 * The stack a branch belongs to, bottom to top: down through each PR's base
 * branch while another PR has that branch as its head, and up through PRs
 * that use the current head as their base. When several PRs share a branch
 * the newest one wins. A branch with no PR becomes a single local entry.
 */
export function buildChain(prs: readonly PrInfo[], startBranch: string, defaultBranch: string): StackEntry[] {
  const newestByHead = new Map<string, PrInfo>();
  const newestByBase = new Map<string, PrInfo>();
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    newestByHead.set(pr.headRefName, pr);
    newestByBase.set(pr.baseRefName, pr);
  }

  const start = newestByHead.get(startBranch);
  if (start === undefined) {
    return [{ number: null, title: startBranch, headRef: startBranch, baseRef: defaultBranch, state: "local", approved: false }];
  }

  const chain: PrInfo[] = [start];
  const seen = new Set([start.number]);
  for (let below = newestByHead.get(start.baseRefName); below && !seen.has(below.number); below = newestByHead.get(below.baseRefName)) {
    chain.unshift(below);
    seen.add(below.number);
  }
  for (let above = newestByBase.get(start.headRefName); above && !seen.has(above.number); above = newestByBase.get(above.headRefName)) {
    chain.push(above);
    seen.add(above.number);
  }
  return chain.map(toEntry);
}

function toEntry(pr: PrInfo): StackEntry {
  const state =
    pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : pr.isDraft ? "draft" : "open";
  return { number: pr.number, title: pr.title, headRef: pr.headRefName, baseRef: pr.baseRefName, state, approved: pr.reviewDecision === "APPROVED" };
}
