// PR Link — each chat's pull request. Detected from the chat's current branch,
// or attached by hand (or by another plugin) and then kept until detached.
// Other plugins read it with `experimental_useRpcKeyedQuery` and refresh on
// their own: every change invalidates the thread's key tag.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { PR_LINK_PLUGIN_ID, prLinkRpcContract, threadTag, type ThreadPr } from "./contract";
import { StaleCache } from "./cache";
import { errorText, gh, git } from "./host";
import { pickBranchPr, toLinked, type GhPr } from "./pick";
import { githubRepo, parsePr } from "./refs";

const PR_FIELDS = "number,title,url,state,isDraft,headRefName,baseRefName,reviewDecision";
/** GitHub is asked at most this often per branch or attached PR. */
const GITHUB_TTL_MS = 90_000;
/** Threads someone looked at recently are re-checked on this beat, so a branch switch shows up. */
const WATCH_INTERVAL_MS = 60_000;
const WATCH_WINDOW_MS = 10 * 60_000;

export default async function plugin(bb: BbPluginApi) {
  const branchPrs = new StaleCache<GhPr | null>(GITHUB_TTL_MS);
  const attachedPrs = new StaleCache<GhPr>(GITHUB_TTL_MS);
  const lastSeen = new Map<string, number>();
  const lastValue = new Map<string, string>();
  /** The newest attach or detach per thread; an older one still checking GitHub must not overwrite it. */
  const latestChange = new Map<string, number>();
  let changeCount = 0;

  async function readAttachment(threadId: string): Promise<string | null> {
    const metadata = (await bb.sdk.threads.getPluginMetadata({ threadId, pluginId: PR_LINK_PLUGIN_ID })) as Record<string, unknown>;
    return typeof metadata.attachedPr === "string" ? metadata.attachedPr : null;
  }

  /** The chat's worktree, current branch and GitHub repo, when it has them. */
  async function branchOf(threadId: string): Promise<{ repo: string; branch: string } | null> {
    const thread = (await bb.sdk.threads.get({ threadId })) as { environmentId?: string | null };
    if (!thread.environmentId) return null;
    const env = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    if (!env.path) return null;
    try {
      const [remote, branch] = await Promise.all([
        git(env.path, ["remote", "get-url", "origin"]),
        git(env.path, ["branch", "--show-current"]),
      ]);
      const repo = githubRepo(remote.trim());
      return repo && branch.trim() ? { repo, branch: branch.trim() } : null;
    } catch {
      return null;
    }
  }

  async function resolve(threadId: string): Promise<ThreadPr> {
    const attached = await readAttachment(threadId);
    if (attached !== null) {
      const [repo, number] = attached.split("#");
      const { value, error } = await attachedPrs.get(attached, async () =>
        JSON.parse(await gh(["pr", "view", number!, "-R", repo!, "--json", PR_FIELDS])) as GhPr,
      );
      return { mode: "attached", pr: value ? toLinked(repo!, value) : null, error };
    }
    const place = await branchOf(threadId);
    if (place === null) return { mode: "none", pr: null, error: null };
    const { value, error } = await branchPrs.get(`${place.repo}:${place.branch}`, async () =>
      pickBranchPr(JSON.parse(
        await gh(["pr", "list", "-R", place.repo, "--head", place.branch, "--state", "all", "--limit", "20", "--json", PR_FIELDS]),
      ) as GhPr[]),
    );
    return value ? { mode: "auto", pr: toLinked(place.repo, value), error } : { mode: "none", pr: null, error };
  }

  async function resolveMany(threadIds: readonly string[]): Promise<Record<string, ThreadPr>> {
    const out: Record<string, ThreadPr> = {};
    const now = Date.now();
    await Promise.all(
      threadIds.map(async (threadId) => {
        lastSeen.set(threadId, now);
        try {
          out[threadId] = await resolve(threadId);
        } catch (e) {
          out[threadId] = { mode: "none", pr: null, error: errorText(e) };
        }
        lastValue.set(threadId, JSON.stringify(out[threadId]));
      }),
    );
    return out;
  }

  /**
   * Tells every window the chat's PR changed, then once more a moment later:
   * a window whose read was already in flight when the first push landed could
   * keep the old PR until the next watcher beat.
   */
  function announce(threadId: string) {
    bb.rpc.experimental_invalidate([threadTag(threadId)]);
    setTimeout(() => bb.rpc.experimental_invalidate([threadTag(threadId)]), 2_000).unref?.();
  }

  async function attach(threadId: string, value: string) {
    const change = ++changeCount;
    latestChange.set(threadId, change);
    const parsed = parsePr(value);
    const repo = parsed.repo ?? (await branchOf(threadId))?.repo ?? null;
    if (repo === null) throw new Error("Give a full PR URL: this chat has no GitHub repo.");
    const key = `${repo}#${parsed.number}`;
    // Fail now, not later in every reader, when the PR does not exist.
    attachedPrs.clear(key);
    const { value: found, error } = await attachedPrs.get(key, async () =>
      JSON.parse(await gh(["pr", "view", String(parsed.number), "-R", repo, "--json", PR_FIELDS])) as GhPr,
    );
    if (found === null) throw new Error(error ?? `PR ${key} not found.`);
    if (latestChange.get(threadId) !== change) return;
    await bb.sdk.threads.updatePluginMetadata({ threadId, pluginId: PR_LINK_PLUGIN_ID, set: { attachedPr: key } });
    announce(threadId);
  }

  async function detach(threadId: string) {
    latestChange.set(threadId, ++changeCount);
    await bb.sdk.threads.updatePluginMetadata({ threadId, pluginId: PR_LINK_PLUGIN_ID, remove: ["attachedPr"] });
    announce(threadId);
  }

  bb.rpc.register(prLinkRpcContract, {
    pullRequests: ({ keys }) => resolveMany(keys),
    attach: async ({ threadId, pr }) => {
      await attach(threadId, pr);
      return { ok: true as const };
    },
    detach: async ({ threadId }) => {
      await detach(threadId);
      return { ok: true as const };
    },
  });

  // Re-check recently viewed chats so a branch switch or a new PR reaches
  // every reader without anyone reloading.
  const timer = setInterval(() => {
    const cutoff = Date.now() - WATCH_WINDOW_MS;
    for (const [threadId, seen] of lastSeen) {
      if (seen < cutoff) {
        lastSeen.delete(threadId);
        lastValue.delete(threadId);
        continue;
      }
      void resolve(threadId)
        .then((value) => {
          const next = JSON.stringify(value);
          if (lastValue.get(threadId) !== next) {
            lastValue.set(threadId, next);
            bb.rpc.experimental_invalidate([threadTag(threadId)]);
          }
        })
        .catch(() => {});
    }
  }, WATCH_INTERVAL_MS);
  timer.unref?.();

  const usage = "Usage: bb pr-link show <thread-id> | attach <thread-id> <PR URL or number> | detach <thread-id>";
  bb.cli.register({
    name: "pr-link",
    summary: "Show or set a chat's pull request",
    commands: [
      { name: "show", summary: "Print the chat's pull request as JSON", usage: "bb pr-link show <thread-id>" },
      { name: "attach", summary: "Make a PR the chat's pull request", usage: "bb pr-link attach <thread-id> <PR URL or number>" },
      { name: "detach", summary: "Go back to the PR of the chat's branch", usage: "bb pr-link detach <thread-id>" },
    ],
    async run(argv) {
      const [command, threadId, pr] = argv;
      try {
        if (command === "show" && threadId) {
          return { exitCode: 0, stdout: JSON.stringify((await resolveMany([threadId]))[threadId], null, 2) };
        }
        if (command === "attach" && threadId && pr) {
          await attach(threadId, pr);
          return { exitCode: 0, stdout: `Attached ${pr}.` };
        }
        if (command === "detach" && threadId) {
          await detach(threadId);
          return { exitCode: 0, stdout: "Back to the branch's PR." };
        }
      } catch (e) {
        return { exitCode: 1, stderr: errorText(e) };
      }
      return { exitCode: command ? 1 : 0, ...(command ? { stderr: usage } : { stdout: usage }) };
    },
  });
}
