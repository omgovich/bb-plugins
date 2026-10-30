import type { PluginCodeThemeData } from "@get-bb/plugin-sdk/app";

type Role = "plain" | "comment" | "keyword" | "string" | "constant" | "type";
const cache = new WeakMap<
  PluginCodeThemeData,
  Partial<Record<"light" | "dark", string>>
>();

// Only palette-level scopes: language-specific overrides reuse these colors
// for unrelated roles and should not recolor every language's base palette.
const genericRoles: Readonly<Record<string, Role>> = {
  comment: "comment",
  string: "string",
  keyword: "keyword",
  "storage.modifier": "keyword",
  "storage.type": "type",
  "constant.numeric": "constant",
  "constant.language": "constant",
  "constant.language.boolean": "constant",
  "support.type": "type",
  "entity.name.type": "type",
  "entity.name.class": "type",
  variable: "plain",
  identifier: "plain",
  "entity.name.function": "plain",
  "support.function": "plain",
  punctuation: "plain",
};

// BB's worker emits token colors rather than TextMate scopes. Translate its
// published theme rules into a small display palette; highlighting stays in
// the shared workers. Unknown colors remain neutral instead of becoming neon.
export function desktopSyntaxCSS(
  theme: PluginCodeThemeData | null,
  mode: "light" | "dark",
): string {
  const base = "[data-line] > span { color: var(--pr-diff-text); }";
  if (!theme) return base;
  const cached = cache.get(theme)?.[mode];
  if (cached) return cached;
  const roles = new Map<string, Set<Role>>();
  for (const rule of theme.tokenColors) {
    const color = rule.settings.foreground;
    if (!color || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(color)) continue;
    const scopes =
      typeof rule.scope === "string"
        ? rule.scope.split(",")
        : (rule.scope ?? []);
    const set = roles.get(color.toLowerCase()) ?? new Set<Role>();
    for (const scope of scopes) {
      const role = genericRoles[scope.trim()];
      if (role) set.add(role);
    }
    roles.set(color.toLowerCase(), set);
  }
  const rules = [base];
  for (const [color, kinds] of roles) {
    // A source theme can share one color between several syntax categories.
    // Keep ambiguous names/types neutral; shared comment/punctuation gray stays muted.
    const role: Role = kinds.has("comment")
      ? "comment"
      : kinds.has("plain")
        ? "plain"
        : kinds.has("keyword")
          ? "keyword"
          : kinds.has("string")
            ? "string"
            : kinds.has("constant")
              ? "constant"
              : kinds.has("type")
                ? "type"
                : "plain";
    const key = `--diffs-token-${mode}:`;
    rules.push(
      `[data-line] span[style*="${key}${color}" i], [data-line] span[style*="${key} ${color}" i] { color: var(--pr-diff-${role === "plain" ? "text" : role}); }`,
    );
  }
  const css = rules.join("\n");
  cache.set(theme, { ...cache.get(theme), [mode]: css });
  return css;
}
