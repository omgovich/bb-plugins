import { describe, expect, it } from "vitest";
import { LruCache } from "../src/cache";
import { isGeneratedPath, isTestPath } from "../src/generated";

describe("LruCache", () => {
  it("drops the least recently used entry", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });
});

describe("isGeneratedPath", () => {
  it("knows lockfiles, snapshots and build output", () => {
    expect(isGeneratedPath("package-lock.json")).toBe(true);
    expect(isGeneratedPath("apps/web/pnpm-lock.yaml")).toBe(true);
    expect(isGeneratedPath("src/__snapshots__/a.test.ts.snap")).toBe(true);
    expect(isGeneratedPath("packages/x/dist/index.js")).toBe(true);
    expect(isGeneratedPath("api/client.generated.ts")).toBe(true);
  });
  it("leaves source files alone", () => {
    expect(isGeneratedPath("src/build.ts")).toBe(false);
    expect(isGeneratedPath("src/distance.ts")).toBe(false);
    expect(isGeneratedPath("package.json")).toBe(false);
  });
});

describe("isTestPath", () => {
  it("knows test files and test folders", () => {
    for (const path of [
      "src/search.test.ts", "src/Search.test.tsx", "src/a.spec.js", "e2e/search.e2e.ts",
      "src/__tests__/search.ts", "packages/x/tests/a.ts", "test/setup.ts", "src/testing/render.tsx",
      "src/PdfTesting/helpers.ts", "pkg/search_test.go", "app/test_views.py",
      "src/search/testUtils.ts", "src/test-utils.tsx", "src/setupTests.ts",
    ]) expect(isTestPath(path), path).toBe(true);
  });
  it("leaves source files alone", () => {
    for (const path of ["src/contest.ts", "src/latest/a.ts", "src/attestation.ts", "src/Button.stories.tsx"])
      expect(isTestPath(path), path).toBe(false);
  });
});
