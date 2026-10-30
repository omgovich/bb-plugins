import { describe, expect, it } from "vitest";
import { formatComment } from "../src/comment";

const base = {
  number: 905 as number | null,
  headRef: "text-search-edits",
  source: "local" as const,
  path: "src/react-api/search/useSearch.ts",
  line: 42,
  code: "  matcher.find(query, edits), [query, edits])",
  text: "Why edits in deps?\nUse a ref instead.",
};

describe("formatComment", () => {
  it("names the PR, source, file and line, quotes the code and keeps the note", () => {
    expect(formatComment(base)).toBe(
      "Review note on PR #905 (local) · src/react-api/search/useSearch.ts:42\n" +
        ">   matcher.find(query, edits), [query, edits])\n\n" +
        "Why edits in deps?\nUse a ref instead.",
    );
  });

  it("falls back to the branch name when there is no PR", () => {
    expect(formatComment({ ...base, number: null, source: "local" }).split("\n")[0]).toBe(
      "Review note on branch text-search-edits (local) · src/react-api/search/useSearch.ts:42",
    );
  });

  it("says github for the GitHub source", () => {
    expect(formatComment({ ...base, source: "github" })).toContain("PR #905 (GitHub)");
  });
});
