import type { CSSProperties } from "react";

// GitHub Desktop's classic charcoal diff surface. Syntax highlighting stays
// with BB's shared worker pool; these overrides affect only this renderer.
export function desktopDiffStyle(mode: "light" | "dark"): CSSProperties {
  const dark = mode === "dark";
  const foreground = dark ? "#f0f3f6" : "#24292e";
  const background = dark ? "#24292e" : "#ffffff";
  const muted = dark ? "#959da5" : "#6a737d";
  return {
    "--pr-diff-text": foreground,
    "--pr-diff-comment": muted,
    "--pr-diff-keyword": dark ? "#f97583" : "#d73a49",
    "--pr-diff-string": dark ? "#ffab70" : "#032f62",
    "--pr-diff-constant": dark ? "#79b8ff" : "#005cc5",
    "--pr-diff-type": dark ? "#b392f0" : "#6f42c1",
    "--diffs-font-size": "12px",
    "--diffs-line-height": "20px",
    "--diffs-dark": foreground,
    "--diffs-light": foreground,
    "--diffs-dark-bg": background,
    "--diffs-light-bg": background,
    "--diffs-bg-context-override": background,
    "--diffs-bg-context-gutter-override": dark ? "#1d2125" : "#f6f8fa",
    "--diffs-bg-separator-override": dark ? "#1d2125" : "#f1f8ff",
    "--diffs-addition-color-override": foreground,
    "--diffs-deletion-color-override": foreground,
    "--diffs-fg-number-override": muted,
    "--diffs-fg-number-addition-override": muted,
    "--diffs-fg-number-deletion-override": muted,
    "--pr-diff-addition": dark ? "#133a1e" : "#e6ffed",
    "--pr-diff-addition-gutter": dark ? "#0b2713" : "#cdffd8",
    "--pr-diff-deletion": dark ? "#4b0c0c" : "#ffeef0",
    "--pr-diff-deletion-gutter": dark ? "#350909" : "#ffdce0",
    "--diffs-bg-addition-emphasis-override": "transparent",
    "--diffs-bg-deletion-emphasis-override": "transparent",
  } as CSSProperties;
}

// The renderer normally mixes its background overrides into the base color.
// Set the line background directly so these are the intended diff surfaces,
// while leaving its highlighting, hover utility and annotations intact.
export const desktopDiffCSS = `
[data-line-type="change-addition"] { --diffs-line-bg: var(--pr-diff-addition); }
[data-line-type="change-deletion"] { --diffs-line-bg: var(--pr-diff-deletion); }
[data-column-number][data-line-type="change-addition"] { --diffs-line-bg: var(--pr-diff-addition-gutter); }
[data-column-number][data-line-type="change-deletion"] { --diffs-line-bg: var(--pr-diff-deletion-gutter); }
[data-line-type="change-addition"][data-hovered] { --diffs-line-bg: color-mix(in srgb, var(--pr-diff-addition) 90%, var(--diffs-fg)); }
[data-line-type="change-deletion"][data-hovered] { --diffs-line-bg: color-mix(in srgb, var(--pr-diff-deletion) 90%, var(--diffs-fg)); }
`;
