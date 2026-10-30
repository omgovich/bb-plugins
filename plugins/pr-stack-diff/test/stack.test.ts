import { describe, expect, it } from "vitest";
import { buildChain, type PrInfo } from "../src/stack";

const pr = (
  number: number,
  head: string,
  base: string,
  state: PrInfo["state"] = "OPEN",
): PrInfo => ({
  number,
  title: `PR ${number}`,
  headRefName: head,
  baseRefName: base,
  state,
  isDraft: false,
  headRefOid: `oid${number}`,
});

const PRS = [
  pr(642, "controller", "main", "MERGED"),
  pr(905, "edits", "controller"),
  pr(961, "e2e", "edits"),
  pr(700, "unrelated", "main"),
];

describe("buildChain", () => {
  it.each(["controller", "edits", "e2e"])(
    "resolves the whole chain from %s, bottom to top",
    (start) => {
      expect(buildChain(PRS, start, "main").map((e) => e.number)).toEqual([
        642, 905, 961,
      ]);
    },
  );

  it("keeps a merged PR in the chain, marked merged", () => {
    expect(buildChain(PRS, "e2e", "main")[0]).toMatchObject({
      number: 642,
      state: "merged",
      baseRef: "main",
    });
  });

  it("excludes PRs outside the chain", () => {
    expect(buildChain(PRS, "edits", "main").some((e) => e.number === 700)).toBe(
      false,
    );
  });

  it("falls back to a single local entry for a branch with no PR", () => {
    expect(buildChain(PRS, "wip", "main")).toEqual([
      {
        number: null,
        title: "wip",
        headRef: "wip",
        baseRef: "main",
        state: "local",
        approved: false,
      },
    ]);
  });

  it("marks drafts", () => {
    const draft = { ...pr(1, "d", "main"), isDraft: true };
    expect(buildChain([draft], "d", "main")[0]!.state).toBe("draft");
  });
  it("marks a PR approved only for GitHub's aggregate APPROVED decision", () => {
    for (const reviewDecision of [
      "APPROVED",
      "CHANGES_REQUESTED",
      "REVIEW_REQUIRED",
      null,
      undefined,
    ] as const) {
      const reviewed = { ...pr(1, "reviewed", "main"), reviewDecision };
      expect(buildChain([reviewed], "reviewed", "main")[0]!.approved).toBe(
        reviewDecision === "APPROVED",
      );
    }
  });
});
