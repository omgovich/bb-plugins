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

/** gh's failure, in words that say what to do. */
export function peekError(error: unknown): string {
  const text = errorText(error);
  if (/could not resolve to a (repository|pullrequest)|not found|404/i.test(text))
    return "No access to this repository through your gh login, or the PR does not exist.";
  if (/auth|token|log ?in|401|403/i.test(text)) return "gh is not logged in: run gh auth login.";
  if (/gh is not installed/i.test(text)) return "gh is not installed on the machine that runs bb.";
  return text.split("\n")[0]!;
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
    const { value, error } = await cache.get(key, async () => {
      try {
        return toPeek(JSON.parse(await gh(["pr", "view", String(ref.number), "-R", ref.repo, "--json", FIELDS])) as GhPr);
      } catch (e) {
        throw new Error(peekError(e));
      }
    });
    return { pr: value, error: value === null ? error : null };
  }

  bb.rpc.register(prPeekRpcContract, {
    pullRequests: async ({ keys }) => {
      const entries = await Promise.all(
        keys.map(async (key) => [key, await peek(key).catch((e) => ({ pr: null, error: peekError(e) }))] as const),
      );
      return Object.fromEntries(entries);
    },
  });
}
