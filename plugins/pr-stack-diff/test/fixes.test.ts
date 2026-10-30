import { describe, expect, it } from "vitest";
import { editFingerprint } from "../src/diff";
import { chooseBase } from "../src/base";
import { StaleCache } from "../src/cache";

describe("binary fingerprint", () => {
  const bin = (blobs: string) => `diff --git a/l.png b/l.png\nindex ${blobs} 100644\nBinary files a/l.png and b/l.png differ`;
  it("changes when the binary's blobs change", () => {
    expect(editFingerprint(bin("aaa..bbb"))).not.toBe(editFingerprint(bin("aaa..ccc")));
  });
  it("stays when the blobs are the same", () => {
    expect(editFingerprint(bin("aaa..bbb"))).toBe(editFingerprint(bin("aaa..bbb")));
  });
});

describe("chooseBase", () => {
  it("uses origin when the local base is behind it", () => {
    expect(chooseBase("main", { hasLocal: true, hasRemote: true, localBehindRemote: true })).toBe("origin/main");
  });
  it("keeps a local stack parent that is not behind", () => {
    expect(chooseBase("edits", { hasLocal: true, hasRemote: true, localBehindRemote: false })).toBe("edits");
  });
  it("falls back to whichever exists", () => {
    expect(chooseBase("x", { hasLocal: false, hasRemote: true, localBehindRemote: false })).toBe("origin/x");
    expect(chooseBase("x", { hasLocal: true, hasRemote: false, localBehindRemote: false })).toBe("x");
  });
});

describe("StaleCache", () => {
  it("serves a fresh value without loading again", async () => {
    let now = 0;
    let loads = 0;
    const cache = new StaleCache<number>(60_000, () => now);
    const load = async () => ++loads;
    expect(await cache.get("r", load)).toEqual({ value: 1, error: null });
    now = 30_000;
    expect(await cache.get("r", load)).toEqual({ value: 1, error: null });
    now = 61_000;
    expect(await cache.get("r", load)).toEqual({ value: 2, error: null });
  });
  it("keeps the last good value when a reload fails", async () => {
    let now = 0;
    const cache = new StaleCache<number>(1, () => now);
    await cache.get("r", async () => 7);
    now = 10;
    expect(await cache.get("r", async () => { throw new Error("rate limited"); })).toEqual({ value: 7, error: "rate limited" });
  });
  it("reports the error when nothing was ever loaded", async () => {
    const cache = new StaleCache<number>(1, () => 0);
    expect(await cache.get("r", async () => { throw new Error("no gh"); })).toEqual({ value: null, error: "no gh" });
  });
});
