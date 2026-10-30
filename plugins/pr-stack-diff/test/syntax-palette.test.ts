import { describe, expect, it } from "vitest";
import type { PluginCodeThemeData } from "@get-bb/plugin-sdk/app";
import { desktopSyntaxCSS } from "../src/ui/syntax-palette";

function theme(
  tokenColors: PluginCodeThemeData["tokenColors"],
): PluginCodeThemeData {
  return {
    name: "fixture",
    type: "dark",
    fg: "#ffffff",
    bg: "#000000",
    colors: {},
    tokenColors,
  };
}

describe("Desktop syntax palette", () => {
  it("keeps identifiers neutral while retaining restrained keyword, string and comment colors", () => {
    const css = desktopSyntaxCSS(
      theme([
        { scope: "variable", settings: { foreground: "#FFA359" } },
        { scope: "keyword", settings: { foreground: "#FF678D" } },
        {
          scope: ["string", "punctuation.definition.string"],
          settings: { foreground: "#5ECC71" },
        },
        { scope: "comment", settings: { foreground: "#636363" } },
      ]),
      "dark",
    );
    expect(css).toContain('--diffs-token-dark:#ffa359" i]');
    expect(css).toContain("color: var(--pr-diff-text)");
    expect(css).toContain("color: var(--pr-diff-keyword)");
    expect(css).toContain("color: var(--pr-diff-string)");
    expect(css).toContain("color: var(--pr-diff-comment)");
  });

  it("keeps shared name/type colors neutral and shared comment/punctuation colors muted", () => {
    const css = desktopSyntaxCSS(
      theme([
        {
          scope: ["entity.name.type", "entity.name.function"],
          settings: { foreground: "#b392f0" },
        },
        {
          scope: ["comment", "punctuation"],
          settings: { foreground: "#959da5" },
        },
      ]),
      "light",
    );
    expect(css).toMatch(/token-light:#b392f0[^\n]+pr-diff-text/);
    expect(css).toMatch(/token-light:#959da5[^\n]+pr-diff-comment/);
  });

  it("does not let an unrelated language override change a base palette category", () => {
    const css = desktopSyntaxCSS(
      theme([
        { scope: "keyword", settings: { foreground: "#ff678d" } },
        {
          scope: "variable.other.generic-type.haskell",
          settings: { foreground: "#ff678d" },
        },
      ]),
      "dark",
    );
    expect(css).toMatch(/token-dark:#ff678d[^\n]+pr-diff-keyword/);
  });

  it("leaves code readable before a theme loads and ignores invalid foreground values", () => {
    const css = desktopSyntaxCSS(
      theme([{ scope: "keyword", settings: { foreground: 'red"] {}' } }]),
      "dark",
    );
    expect(css).toBe(desktopSyntaxCSS(null, "dark"));
    expect(css).toContain("--pr-diff-text");
  });
});
