import { describe, expect, it } from "vitest";
import { parsePrKey, parsePullUrl, prKey } from "../src/refs";
import { toPeek } from "../src/server";

describe("parsePullUrl", () => {
  it("reads PR links, with or without a tab or anchor", () => {
    expect(parsePullUrl("https://github.com/omgovich/colord/pull/157")).toEqual({ repo: "omgovich/colord", number: 157 });
    expect(parsePullUrl("https://github.com/Acme/Widgets/pull/12/files#diff-1")).toEqual({ repo: "acme/widgets", number: 12 });
    expect(parsePullUrl("https://www.github.com/a/b.js/pull/3?w=1")).toEqual({ repo: "a/b.js", number: 3 });
  });
  it("ignores issues, other hosts and look-alikes", () => {
    expect(parsePullUrl("https://github.com/a/b/issues/3")).toBeNull();
    expect(parsePullUrl("https://gitlab.com/a/b/pull/3")).toBeNull();
    expect(parsePullUrl("https://github.com/a/b/pull/3x")).toBeNull();
    expect(parsePullUrl("https://evil.test/?u=https://github.com/a/b/pull/3")).toBeNull();
  });
  it("round-trips through the key", () => {
    const ref = parsePullUrl("https://github.com/a/b/pull/9")!;
    expect(parsePrKey(prKey(ref))).toEqual(ref);
    expect(parsePrKey("a/b#x")).toBeNull();
  });
});

describe("toPeek", () => {
  const base = { title: "T", isDraft: false, author: { login: "me" }, additions: 1, deletions: 2, changedFiles: 3 };
  it("maps states", () => {
    expect(toPeek({ ...base, state: "OPEN" }).state).toBe("open");
    expect(toPeek({ ...base, state: "OPEN", isDraft: true }).state).toBe("draft");
    expect(toPeek({ ...base, state: "MERGED" }).state).toBe("merged");
    expect(toPeek({ ...base, state: "CLOSED" }).state).toBe("closed");
  });
});

describe("peekError", async () => {
  const { peekError } = await import("../src/server");
  it("says what is wrong", () => {
    expect(peekError({ stderr: "GraphQL: Could not resolve to a Repository with the name 'a/b'." })).toMatch(/No access/);
    expect(peekError({ stderr: "To get started with GitHub CLI, please run:  gh auth login" })).toMatch(/not logged in/);
  });
});
