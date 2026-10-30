import { describe, expect, it } from "vitest";
import { editFingerprint, splitPatch } from "../src/diff";

const PATCH = `diff --git a/src/search.ts b/src/search.ts
index 1111111..2222222 100644
--- a/src/search.ts
+++ b/src/search.ts
@@ -10,3 +10,4 @@ export function search() {
   const a = 1;
-  const b = 2;
+  const b = 3;
+  const c = 4;
   return a;
diff --git a/src/a.ts b/src/b.ts
similarity index 90%
rename from src/a.ts
rename to src/b.ts
index 3333333..4444444 100644
--- a/src/a.ts
+++ b/src/b.ts
@@ -1,2 +1,2 @@
-export const x = 1;
+export const x = 2;
 export const y = 2;
diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
index 0000000..5555555
Binary files /dev/null and b/assets/logo.png differ
`;

describe("splitPatch", () => {
  it("splits a multi-file diff and reads status, rename and binary", () => {
    const files = splitPatch(PATCH);
    expect(files.map((f) => f.path)).toEqual(["src/search.ts", "src/b.ts", "assets/logo.png"]);
    expect(files[0]).toMatchObject({ status: "modified", oldPath: null, binary: false, additions: 2, deletions: 1 });
    expect(files[1]).toMatchObject({ status: "renamed", oldPath: "src/a.ts", additions: 1, deletions: 1 });
    expect(files[2]).toMatchObject({ status: "added", binary: true, additions: 0, deletions: 0 });
    expect(files[0]!.patch.startsWith("diff --git a/src/search.ts")).toBe(true);
  });

  it("returns nothing for an empty diff", () => {
    expect(splitPatch("")).toEqual([]);
  });
});

describe("editFingerprint", () => {
  const moved = `@@ -40,3 +52,4 @@ other context
   const zzz = 1;
-  const b = 2;
+  const b = 3;
+  const c = 4;
   unrelated();`;
  const original = splitPatch(PATCH)[0]!.patch;

  it("ignores line numbers and context when the edits are the same", () => {
    expect(editFingerprint(moved)).toBe(editFingerprint(original));
  });

  it("changes when an edit is added", () => {
    expect(editFingerprint(`${moved}\n+  const d = 5;`)).not.toBe(editFingerprint(original));
  });
});
