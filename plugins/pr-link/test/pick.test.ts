import { describe, expect, it } from "vitest";
import { pickBranchPr, toLinked, type GhPr } from "../src/pick";
import { parsePr } from "../src/refs";

const pr = (number: number, state: GhPr["state"], extra: Partial<GhPr> = {}): GhPr => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  state,
  isDraft: false,
  headRefName: "feature",
  baseRefName: "main",
  ...extra,
});

describe("pickBranchPr", () => {
  it("prefers the newest open PR over merged ones", () => {
    expect(pickBranchPr([pr(5, "MERGED"), pr(9, "OPEN"), pr(7, "OPEN")])?.number).toBe(9);
  });
  it("falls back to the newest closed or merged PR", () => {
    expect(pickBranchPr([pr(3, "CLOSED"), pr(4, "MERGED")])?.number).toBe(4);
  });
  it("is null with no PRs", () => {
    expect(pickBranchPr([])).toBeNull();
  });
});

describe("toLinked", () => {
  it("maps state, draft and approval", () => {
    expect(toLinked("o/r", pr(1, "OPEN", { isDraft: true })).state).toBe("draft");
    expect(toLinked("o/r", pr(1, "MERGED")).state).toBe("merged");
    expect(toLinked("o/r", pr(1, "OPEN", { reviewDecision: "APPROVED" })).approved).toBe(true);
    expect(toLinked("o/r", pr(1, "OPEN", { reviewDecision: "REVIEW_REQUIRED" })).approved).toBe(false);
  });
});

describe("parsePr", () => {
  it("reads a URL and short forms", () => {
    expect(parsePr("https://github.com/o/r/pull/12")).toEqual({ repo: "o/r", number: 12 });
    expect(parsePr("#12")).toEqual({ repo: null, number: 12 });
  });
});
