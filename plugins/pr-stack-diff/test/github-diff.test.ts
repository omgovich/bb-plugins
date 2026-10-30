import { beforeEach, describe, expect, it, vi } from "vitest";
import { githubDiff } from "../src/github-diff";
import { gh, git } from "../src/host";

vi.mock("../src/host", () => ({ git: vi.fn(), gh: vi.fn() }));
const input = {
  worktree: "/repo",
  repo: "org/repo",
  originRepo: "org/repo",
  number: 42,
  baseRef: "parent",
  baseOid: "base-oid",
};

beforeEach(() => vi.resetAllMocks());

describe("GitHub whitespace-hidden diff", () => {
  it("fetches remote PR endpoints without moving local branches and diffs their OIDs with -w", async () => {
    vi.mocked(git)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("head-oid\nbase-oid\n")
      .mockResolvedValueOnce("patch");
    expect(await githubDiff(input)).toEqual({
      patch: "patch",
      whitespaceHidden: true,
    });
    const fetch = vi.mocked(git).mock.calls[0]![1];
    expect(fetch.slice(0, 5)).toEqual([
      "fetch",
      "--no-tags",
      "--no-write-fetch-head",
      "origin",
      expect.stringMatching(/^\+pull\/42\/head:refs\/pr-stack-diff\//),
    ]);
    expect(fetch[5]).toMatch(/^\+base-oid:refs\/pr-stack-diff\/.+\/42\/base$/);
    expect(git).toHaveBeenLastCalledWith("/repo", [
      "diff",
      "-w",
      "--no-color",
      "--find-renames",
      "base-oid...head-oid",
      "--",
    ]);
    expect(gh).not.toHaveBeenCalled();
  });

  it("fetches an attached repository instead of the unrelated origin and falls back to its base branch without cached metadata", async () => {
    vi.mocked(git)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("h\nb\n")
      .mockResolvedValueOnce("");
    await githubDiff({ ...input, repo: "other/repo", baseOid: undefined });
    const fetch = vi.mocked(git).mock.calls[0]![1];
    expect(fetch[3]).toBe("https://github.com/other/repo.git");
    expect(fetch[5]).toMatch(/^\+refs\/heads\/parent:refs\/pr-stack-diff\//);
  });

  it("uses gh only when fetching fails", async () => {
    vi.mocked(git).mockRejectedValueOnce(new Error("fetch restricted"));
    vi.mocked(gh).mockResolvedValueOnce("fallback patch");
    expect(await githubDiff(input)).toEqual({
      patch: "fallback patch",
      whitespaceHidden: false,
    });
    expect(gh).toHaveBeenCalledWith([
      "pr",
      "diff",
      "42",
      "-R",
      "org/repo",
      "--color",
      "never",
    ]);
    expect(git).toHaveBeenCalledTimes(1);
  });

  it("keeps remote-only chats usable", async () => {
    vi.mocked(gh).mockResolvedValueOnce("remote patch");
    expect(await githubDiff({ ...input, worktree: null })).toEqual({
      patch: "remote patch",
      whitespaceHidden: false,
    });
    expect(git).not.toHaveBeenCalled();
  });

  it("propagates diff errors after a successful fetch rather than silently showing whitespace again", async () => {
    vi.mocked(git)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("h\nb\n")
      .mockRejectedValueOnce(new Error("no merge base"));
    await expect(githubDiff(input)).rejects.toThrow("no merge base");
    expect(gh).not.toHaveBeenCalled();
  });

  it("keeps fallback errors visible", async () => {
    vi.mocked(git).mockRejectedValueOnce(new Error("fetch restricted"));
    vi.mocked(gh).mockRejectedValueOnce(new Error("GitHub unavailable"));
    await expect(githubDiff(input)).rejects.toThrow("GitHub unavailable");
  });
});
