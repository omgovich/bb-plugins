import { describe, expect, it } from "vitest";
import { parseRows } from "../src/ui/rows";
import { isViewed, viewedKey } from "../src/ui/viewed";

const PATCH = `diff --git a/a.ts b/a.ts
index 1..2 100644
--- a/a.ts
+++ b/a.ts
@@ -10,3 +10,4 @@ fn()
 keep
-old
+new
+added
 tail`;

describe("parseRows", () => {
  it("numbers context, removed and added lines and skips the file header", () => {
    expect(parseRows(PATCH)).toEqual([
      { kind: "hunk", oldNo: null, newNo: null, text: "@@ -10,3 +10,4 @@ fn()" },
      { kind: "ctx", oldNo: 10, newNo: 10, text: "keep" },
      { kind: "del", oldNo: 11, newNo: null, text: "old" },
      { kind: "add", oldNo: null, newNo: 11, text: "new" },
      { kind: "add", oldNo: null, newNo: 12, text: "added" },
      { kind: "ctx", oldNo: 12, newNo: 13, text: "tail" },
    ]);
  });
});

describe("viewed", () => {
  it("keys by repo, PR or branch, source and path", () => {
    expect(viewedKey("o/r", 905, "local", "a.ts")).toBe("o/r#905:local:a.ts");
    expect(viewedKey("o/r", "wip", "github", "a.ts")).toBe("o/r#wip:github:a.ts");
  });
  it("is viewed only when the stored fingerprint matches", () => {
    expect(isViewed("abc", "abc")).toBe(true);
    expect(isViewed("abc", "def")).toBe(false);
    expect(isViewed(undefined, "abc")).toBe(false);
  });
});

describe("test files count as viewed", () => {
  it("until the reviewer unticks them", async () => {
    const { isViewed, UNVIEWED } = await import("../src/ui/viewed");
    expect(isViewed(undefined, "fp", true)).toBe(true);
    expect(isViewed("old", "fp", true)).toBe(true);
    expect(isViewed(UNVIEWED, "fp", true)).toBe(false);
    expect(isViewed(undefined, "fp")).toBe(false);
  });
});
