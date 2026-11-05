// PR Peek — answers "what is this pull request?" for links hovered in the app,
// through the user's gh session. Answers are cached, so hovering the same link
// again costs nothing.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { prPeekRpcContract, type PeekResult, type PrPeek } from "./contract";
import { StaleCache } from "./cache";
import { errorText, gh } from "./host";
import { parsePrKey } from "./refs";

/** GitHub is asked about one PR at most this often. */
const TTL_MS = 5 * 60_000;
const FIELDS = "title,state,isDraft,author,additions,deletions,changedFiles";

interface GhPr {
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  author: { login: string } | null;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export function toPeek(pr: GhPr): PrPeek {
  return {
    title: pr.title,
    state: pr.state === "MERGED" ? "merged" : pr.state === "CLOSED" ? "closed" : pr.isDraft ? "draft" : "open",
    author: pr.author?.login ?? null,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
  };
}

export default async function plugin(bb: BbPluginApi) {
  const cache = new StaleCache<PrPeek>(TTL_MS);

  async function peek(key: string): Promise<PeekResult> {
    const ref = parsePrKey(key);
    if (ref === null) return { pr: null, error: "Not a pull request." };
    const { value, error } = await cache.get(key, async () =>
      toPeek(JSON.parse(await gh(["pr", "view", String(ref.number), "-R", ref.repo, "--json", FIELDS])) as GhPr),
    );
    return { pr: value, error: value === null ? error : null };
  }

  bb.rpc.register(prPeekRpcContract, {
    pullRequests: async ({ keys }) => {
      const entries = await Promise.all(
        keys.map(async (key) => [key, await peek(key).catch((e) => ({ pr: null, error: errorText(e) }))] as const),
      );
      return Object.fromEntries(entries);
    },
  });
}
