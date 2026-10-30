import { describe, expect, it } from "vitest";
import { githubRepo, parsePr } from "../src/refs";

describe("githubRepo", () => {
  it.each([
    ["https://github.com/acme/widgets.git", "acme/widgets"],
    ["git@github.com:acme/widgets.git", "acme/widgets"],
    ["https://github.com/octocat/hello-world", "octocat/hello-world"],
  ])("%s → %s", (remote, repo) => expect(githubRepo(remote)).toBe(repo));
  it("is null for a non-GitHub remote", () => expect(githubRepo("https://gitlab.com/a/b.git")).toBeNull());
});

describe("parsePr", () => {
  it("reads a PR URL", () =>
    expect(parsePr("https://github.com/acme/widgets/pull/905/files")).toEqual({ repo: "acme/widgets", number: 905 }));
  it("reads owner/repo#n, #n and n", () => {
    expect(parsePr("acme/widgets#905")).toEqual({ repo: "acme/widgets", number: 905 });
    expect(parsePr("#905")).toEqual({ repo: null, number: 905 });
    expect(parsePr("905")).toEqual({ repo: null, number: 905 });
  });
  it("rejects anything else", () => expect(() => parsePr("text-search")).toThrow());
});

describe("isSafeBranchName", () => {
  it("takes ordinary branch names", async () => {
    const { isSafeBranchName } = await import("../src/refs");
    for (const name of ["main", "feature/search-v2", "user.name/fix_1"]) expect(isSafeBranchName(name), name).toBe(true);
  });
  it("refuses options and revision syntax", async () => {
    const { isSafeBranchName } = await import("../src/refs");
    for (const name of ["--output=/tmp/x", "-b", "a..b", "main~1", "HEAD@{1}", "a b", "/abs"]) expect(isSafeBranchName(name), name).toBe(false);
  });
});
