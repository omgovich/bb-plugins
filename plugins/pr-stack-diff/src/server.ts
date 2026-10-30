// PR Diffs — server side. Reads a chat's worktree and its pull requests with
// git and gh on the host, and sends review notes back into the chat.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { chooseBase } from "./base";
import { LruCache, StaleCache } from "./cache";
import { formatComment } from "./comment";
import { editFingerprint, splitPatch } from "./diff";
import { errorText, gh, git } from "./host";
import { githubDiff } from "./github-diff";
import { githubRepo, parsePr, stackChannel, isSafeBranchName } from "./refs";
import { buildChain, type PrInfo, type StackEntry } from "./stack";

export const PLUGIN_ID = "pr-stack-diff";
const execFileAsync = promisify(execFile);
const PR_LINK_PLUGIN_ID = "pr-link";

const sourceSchema = z.enum(["github", "local"]);

const entrySchema = z.object({
  number: z.number().nullable(),
  title: z.string(),
  headRef: z.string(),
  baseRef: z.string(),
  state: z.enum(["open", "draft", "merged", "closed", "local"]),
  localOid: z.string().nullable(),
  remoteOid: z.string().nullable(),
  diverged: z.boolean(),
  approved: z.boolean(),
});
export type PanelEntry = z.infer<typeof entrySchema>;
type DiffInput = z.infer<typeof prStackDiffRpcContract.getDiff.input>;
type DiffResult = z.infer<typeof prStackDiffRpcContract.getDiff.output>;

const fileSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  status: z.enum(["added", "deleted", "modified", "renamed"]),
  binary: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string(),
  fingerprint: z.string(),
});
export type PanelFile = z.infer<typeof fileSchema>;

export const prStackDiffRpcContract = defineRpcContract({
  getStack: {
    input: z.object({ threadId: z.string().min(1) }),
    output: z.object({
      repo: z.string().nullable(),
      worktree: z.string().nullable(),
      mode: z.enum(["auto", "attached"]),
      currentBranch: z.string().nullable(),
      /** The branch the stack was built from: the attached PR's head, else the worktree's branch. */
      focusBranch: z.string().nullable(),
      entries: z.array(entrySchema),
      error: z.string().nullable(),
    }),
  },
  getDiff: {
    input: z.object({
      threadId: z.string().min(1),
      headRef: z.string().min(1).refine(isSafeBranchName, "Not a branch name"),
      baseRef: z.string().min(1).refine(isSafeBranchName, "Not a branch name"),
      number: z.number().nullable(),
      source: sourceSchema,
    }),
    output: z.object({ files: z.array(fileSchema), error: z.string().nullable(), whitespaceHidden: z.boolean() }),
  },
  sendComment: {
    input: z.object({
      threadId: z.string().min(1),
      number: z.number().nullable(),
      headRef: z.string(),
      source: sourceSchema,
      path: z.string(),
      line: z.number().int(),
      code: z.string(),
      text: z.string().trim().min(1).max(20_000),
    }),
    output: z.object({ ok: z.literal(true) }),
  },
  attach: {
    input: z.object({ threadId: z.string().min(1), pr: z.string().trim().min(1) }),
    output: z.object({ ok: z.literal(true) }),
  },
  detach: {
    input: z.object({ threadId: z.string().min(1) }),
    output: z.object({ ok: z.literal(true) }),
  },
});

interface ThreadContext {
  worktree: string | null;
  repo: string | null;
}

const PR_FIELDS = "number,title,headRefName,baseRefName,state,isDraft,headRefOid,baseRefOid,reviewDecision";

/** PR lists are shared by every open panel and poll; GitHub is asked at most this often per repo. */
const PR_LIST_TTL_MS = 90_000;

export default async function plugin(bb: BbPluginApi) {
  const prLists = new StaleCache<PrInfo[]>(PR_LIST_TTL_MS);
  const attachedPrs = new StaleCache<PrInfo>(PR_LIST_TTL_MS);
  /** The chat's worktree path and its GitHub repo, when it has one. */
  async function threadContext(threadId: string): Promise<ThreadContext> {
    const thread = (await bb.sdk.threads.get({ threadId })) as { environmentId?: string | null };
    if (!thread.environmentId) return { worktree: null, repo: null };
    const env = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    const worktree = env.path ?? null;
    if (worktree === null) return { worktree: null, repo: null };
    let repo: string | null = null;
    try {
      repo = githubRepo((await git(worktree, ["remote", "get-url", "origin"])).trim());
    } catch {
      repo = null;
    }
    return { worktree, repo };
  }

  async function readAttachment(threadId: string): Promise<string | null> {
    // The chat's PR lives in the PR Link plugin; PR Diffs only reads it.
    const metadata = (await bb.sdk.threads.getPluginMetadata({ threadId, pluginId: PR_LINK_PLUGIN_ID })) as Record<string, unknown>;
    return typeof metadata.attachedPr === "string" ? metadata.attachedPr : null;
  }

  /**
   * Every open PR (a stack's PRs can be old, so no recency cap) plus the most
   * recent merged and closed ones, which a stack keeps as "merged" tabs.
   */
  async function listPullRequests(repo: string): Promise<PrInfo[]> {
    const [open, done] = await Promise.all([
      gh(["pr", "list", "-R", repo, "--state", "open", "--limit", "2000", "--json", PR_FIELDS]),
      gh(["pr", "list", "-R", repo, "--state", "merged", "--limit", "300", "--json", PR_FIELDS]),
    ]);
    return [...(JSON.parse(open) as PrInfo[]), ...(JSON.parse(done) as PrInfo[])];
  }

  async function localOid(worktree: string | null, ref: string): Promise<string | null> {
    if (worktree === null) return null;
    try {
      return (await git(worktree, ["rev-parse", "--verify", "--quiet", `refs/heads/${ref}`])).trim() || null;
    } catch {
      return null;
    }
  }

  async function getStack(threadId: string) {
    const { worktree, repo } = await threadContext(threadId);
    const attached = await readAttachment(threadId);
    const mode = attached === null ? ("auto" as const) : ("attached" as const);
    let currentBranch: string | null = null;
    if (worktree !== null) {
      try {
        currentBranch = (await git(worktree, ["branch", "--show-current"])).trim() || null;
      } catch {
        currentBranch = null;
      }
    }
    const empty = { repo, worktree, mode, currentBranch, focusBranch: null as string | null, entries: [] as PanelEntry[] };
    if (repo === null && attached === null) {
      return { ...empty, error: worktree === null ? "This chat has no branch." : "No GitHub remote in this worktree." };
    }

    const stackRepo = attached?.split("#")[0] ?? repo!;
    // A failed refresh keeps the last good list, so a GitHub hiccup does not
    // collapse the stack; the error still shows.
    const listed = await prLists.get(stackRepo, () => listPullRequests(stackRepo));
    const prs: PrInfo[] = [...(listed.value ?? [])];
    const error = listed.error === null ? null : `GitHub: ${listed.error}`;
    let startBranch = currentBranch;
    if (attached !== null) {
      const number = Number(attached.split("#")[1]);
      // The list holds open and recent merged PRs; an attached closed or old
      // one is asked for directly.
      if (!prs.some((pr) => pr.number === number)) {
        const one = await attachedPrs.get(attached, async () =>
          JSON.parse(await gh(["pr", "view", String(number), "-R", stackRepo, "--json", PR_FIELDS])) as PrInfo,
        );
        if (one.value) prs.push(one.value);
      }
      startBranch = prs.find((pr) => pr.number === number)?.headRefName ?? null;
      if (startBranch === null) return { ...empty, repo: stackRepo, error: error ?? `PR ${attached} not found.` };
    }
    if (startBranch === null) return { ...empty, error: error ?? "The worktree is not on a branch." };

    const defaultBranch = prs.length > 0 ? await defaultBranchOf(stackRepo) : "main";
    let chain: StackEntry[] = buildChain(prs, startBranch, defaultBranch);
    // A branch with no PR yet usually sits on top of a stack: show that stack
    // with the branch as a local tab above its nearest ancestor that has a PR.
    if (chain.length === 1 && chain[0]!.number === null && worktree !== null) {
      const parent = await nearestPrAncestor(worktree, startBranch, prs);
      if (parent !== null) {
        chain = [
          ...buildChain(prs, parent, defaultBranch),
          { number: null, title: startBranch, headRef: startBranch, baseRef: parent, state: "local", approved: false },
        ];
      }
    }
    const byNumber = new Map(prs.map((pr) => [pr.number, pr]));
    const entries = await Promise.all(
      chain.map(async (entry): Promise<PanelEntry> => {
        const local = await localOid(worktree, entry.headRef);
        const remote = entry.number === null ? null : byNumber.get(entry.number)?.headRefOid ?? null;
        return { ...entry, localOid: local, remoteOid: remote, diverged: local !== null && remote !== null && local !== remote };
      }),
    );
    return { repo: stackRepo, worktree, mode, currentBranch, focusBranch: startBranch, entries, error };
  }

  /** The open-PR branch closest below `branch` in local history, if any. */
  async function nearestPrAncestor(worktree: string, branch: string, prs: readonly PrInfo[]): Promise<string | null> {
    const localBranches = new Set(
      (await git(worktree, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])).split("\n").filter(Boolean),
    );
    const candidates = prs.filter((pr) => pr.state === "OPEN" && pr.headRefName !== branch && localBranches.has(pr.headRefName));
    const depths = await Promise.all(
      candidates.map(async (pr) => {
        try {
          await git(worktree, ["merge-base", "--is-ancestor", `refs/heads/${pr.headRefName}`, `refs/heads/${branch}`]);
          return { head: pr.headRefName, depth: Number((await git(worktree, ["rev-list", "--count", `refs/heads/${pr.headRefName}`])).trim()) };
        } catch {
          return null;
        }
      }),
    );
    let best: { head: string; depth: number } | null = null;
    for (const found of depths) if (found !== null && (best === null || found.depth > best.depth)) best = found;
    return best?.head ?? null;
  }

  async function localDiffBase(worktree: string, baseRef: string): Promise<string> {
    const local = await localOid(worktree, baseRef);
    let remote: string | null = null;
    try {
      remote = (await git(worktree, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${baseRef}`])).trim() || null;
    } catch {
      remote = null;
    }
    let localBehindRemote = false;
    if (local !== null && remote !== null && local !== remote) {
      try {
        await git(worktree, ["merge-base", "--is-ancestor", local, remote]);
        localBehindRemote = true;
      } catch {
        localBehindRemote = false;
      }
    }
    return chooseBase(baseRef, { hasLocal: local !== null, hasRemote: remote !== null, localBehindRemote });
  }

  const defaultBranches = new Map<string, string>();
  async function defaultBranchOf(repo: string): Promise<string> {
    const known = defaultBranches.get(repo);
    if (known) return known;
    try {
      const name = (await gh(["repo", "view", repo, "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"])).trim();
      defaultBranches.set(repo, name || "main");
      return name || "main";
    } catch {
      return "main";
    }
  }

  // A diff is fixed by its base and head commits, so switching back to a PR
  // already opened costs no git or GitHub work.
  const diffs = new LruCache<DiffResult>(40);

  async function cachedDiff(key: unknown[], read: () => Promise<DiffResult>): Promise<DiffResult> {
    const id = JSON.stringify(key);
    const cached = diffs.get(id);
    if (cached) return cached;
    const result = await read();
    if (result.error === null) diffs.set(id, result);
    return result;
  }

  const diffOf = (unified: string, whitespaceHidden: boolean): DiffResult => ({
    files: splitPatch(unified).map((file) => ({ ...file, fingerprint: editFingerprint(file.patch) })),
    error: null,
    whitespaceHidden,
  });

  async function getDiff(input: DiffInput): Promise<DiffResult> {
    try {
      if (input.source === "github") {
        if (input.number === null) return { files: [], error: "This branch has no pull request on GitHub yet.", whitespaceHidden: true };
        const { worktree, repo } = await threadContext(input.threadId);
        const attached = await readAttachment(input.threadId);
        const stackRepo = attached?.split("#")[0] ?? repo;
        if (stackRepo === null) return { files: [], error: "No GitHub repo for this chat.", whitespaceHidden: true };
        const listed = await prLists.get(stackRepo, () => listPullRequests(stackRepo));
        const pr = listed.value?.find((pr) => pr.number === input.number) ?? (attached ? (await attachedPrs.get(attached, async () =>
          JSON.parse(await gh(["pr", "view", String(input.number), "-R", stackRepo, "--json", PR_FIELDS])) as PrInfo)).value : null);
        const read = async () => {
          const remoteDiff = await githubDiff({
            worktree, repo: stackRepo, originRepo: repo, number: input.number!,
            baseRef: pr?.baseRefName ?? input.baseRef, baseOid: pr?.baseRefOid,
          });
          return diffOf(remoteDiff.patch, remoteDiff.whitespaceHidden);
        };
        // Without both commits known there is nothing safe to key on.
        return pr?.baseRefOid && pr.headRefOid
          ? cachedDiff(["github", stackRepo, input.number, pr.baseRefOid, pr.headRefOid], read)
          : read();
      }
      const { worktree } = await threadContext(input.threadId);
      if (worktree === null) return { files: [], error: "This chat has no worktree.", whitespaceHidden: true };
      const head = await localOid(worktree, input.headRef);
      if (head === null) return { files: [], error: `Branch ${input.headRef} is not in this worktree.`, whitespaceHidden: true };
      const baseName = await localDiffBase(worktree, input.baseRef);
      let base: string;
      try {
        base = (await git(worktree, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${baseName}^{commit}`])).trim();
      } catch {
        return { files: [], error: `Branch ${input.baseRef} is not in this worktree.`, whitespaceHidden: true };
      }
      return cachedDiff(["local", worktree, base, head], async () =>
        diffOf(await git(worktree, ["diff", "-w", "--no-color", "--find-renames", `${base}...${head}`, "--"]), true),
      );
    } catch (e) {
      return { files: [], error: errorText(e), whitespaceHidden: true };
    }
  }

  // The chat's PR is owned by the PR Link plugin; writes go through its CLI so
  // the sidebar and everything else that shows the chat's PR follows along.
  async function attach(threadId: string, pr: string) {
    const parsed = parsePr(pr);
    const repo = parsed.repo ?? (await threadContext(threadId)).repo;
    if (repo === null) throw new Error("Give a full PR URL: this chat has no GitHub repo.");
    await bbCli(["pr-link", "attach", threadId, `${repo}#${parsed.number}`]);
    bb.realtime.publish(stackChannel(threadId), {});
  }

  async function detach(threadId: string) {
    await bbCli(["pr-link", "detach", threadId]);
    bb.realtime.publish(stackChannel(threadId), {});
  }

  /** Runs bb, which may not be on the BB server's PATH. */
  async function bbCli(args: string[]): Promise<void> {
    const candidates = [process.env.BB_CLI, `${process.env.HOME}/.bb/bin/bb`, "bb"].filter(Boolean) as string[];
    let lastError: unknown = null;
    for (const bin of candidates) {
      try {
        await execFileAsync(bin, args, { timeout: 60_000 });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          lastError = error;
          continue;
        }
        throw new Error(errorText(error));
      }
    }
    throw new Error(`The bb command was not found: ${String(lastError)}`);
  }

  bb.rpc.register(prStackDiffRpcContract, {
    getStack: ({ threadId }) => getStack(threadId),
    getDiff: (input) => getDiff(input),
    sendComment: async ({ threadId, ...note }) => {
      await bb.sdk.threads.send({
        threadId,
        mode: "steer-if-active",
        input: [{ type: "text", text: formatComment(note), mentions: [] }],
      });
      return { ok: true as const };
    },
    attach: async ({ threadId, pr }) => {
      await attach(threadId, pr);
      return { ok: true as const };
    },
    detach: async ({ threadId }) => {
      await detach(threadId);
      return { ok: true as const };
    },
  });

  const usage = "Usage: bb pr-diff attach <thread-id> <PR URL or number> | detach <thread-id> | stack <thread-id>";
  bb.cli.register({
    name: "pr-diff",
    summary: "Attach a pull request to a chat's PR Diffs panel",
    commands: [
      { name: "attach", summary: "Show this PR's stack for the chat instead of the detected one", usage: "bb pr-diff attach <thread-id> <PR URL or number>" },
      { name: "detach", summary: "Go back to the automatically detected stack", usage: "bb pr-diff detach <thread-id>" },
      { name: "stack", summary: "Print the stack the panel shows for a chat, as JSON", usage: "bb pr-diff stack <thread-id>" },
    ],
    async run(argv) {
      const [command, threadId, pr] = argv;
      try {
        if (command === "attach" && threadId && pr) {
          await attach(threadId, pr);
          return { exitCode: 0, stdout: `Attached ${pr}.` };
        }
        if (command === "stack" && threadId) {
          return { exitCode: 0, stdout: JSON.stringify(await getStack(threadId), null, 2) };
        }
        if (command === "detach" && threadId) {
          await detach(threadId);
          return { exitCode: 0, stdout: "Back to automatic." };
        }
      } catch (e) {
        return { exitCode: 1, stderr: errorText(e) };
      }
      return { exitCode: command ? 1 : 0, ...(command ? { stderr: usage } : { stdout: usage }) };
    },
  });
}
