// Starts a pull request review in its own worktree thread. The sidebar form,
// the command palette and `bb review-pr` all call startReview below.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  buildReviewPrompt,
  DEFAULT_REVIEW_PROMPT,
  DEFAULT_REVIEW_SECTION,
  githubRepositoryOf,
  parsePullRequestUrl,
  type PullRequestRef,
} from "./shared/reviewPr";

const execFileAsync = promisify(execFile);

export const rpcContract = defineRpcContract({
  review_start: {
    input: z.object({ url: z.string().trim().min(1), instructions: z.string().max(20_000) }),
    output: z.object({ threadId: z.string(), title: z.string() }),
  },
});

interface ProjectCheckout {
  projectId: string;
  hostId: string;
  path: string;
}

/**
 * The PR's own title, e.g. "Search: keep results in sync", or
 * "Review PR #5000" without one. The number is not repeated: the thread is
 * attached to the PR (PR Link), so the sidebar shows it.
 */
function threadTitle(number: number, pullRequestTitle: string | null): string {
  if (pullRequestTitle === null) return `Review PR #${number}`;
  const title = pullRequestTitle.replace(/\s+/g, " ").trim();
  return title.length > 80 ? `${title.slice(0, 79).trimEnd()}…` : title;
}

export default async function plugin(bb: BbPluginApi) {
  // Empty agent fields fall back to the project's defaults, like a new thread.
  const settings = bb.settings.define({
    prompt: {
      type: "string",
      label: "Prompt",
      experimental_multiline: true,
      default: DEFAULT_REVIEW_PROMPT,
    },
    providerId: { type: "string", label: "Agent provider (e.g. claude-code, codex)", default: "" },
    model: { type: "string", label: "Model", default: "" },
    reasoningLevel: { type: "string", label: "Reasoning level", default: "" },
    permissionMode: {
      type: "select",
      label: "Permissions",
      options: ["project", "auto", "accept-edits", "full"],
      experimental_optionLabels: { project: "Project default" },
      default: "project",
    },
    section: { type: "string", label: "Sidebar section (empty: none)", default: DEFAULT_REVIEW_SECTION },
  });

  async function readOriginRepository(path: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", path, "remote", "get-url", "origin"]);
      return githubRepositoryOf(stdout);
    } catch {
      return null;
    }
  }

  /** The local checkout of the BB project whose origin is the PR's repository. */
  async function findProjectCheckout(pullRequest: PullRequestRef): Promise<ProjectCheckout> {
    const wanted = `${pullRequest.owner}/${pullRequest.repo}`.toLowerCase();
    const projects = await bb.sdk.projects.list();
    const candidates = projects.flatMap((project) =>
      project.sources
        .filter((source) => source.type === "local_path" && source.path)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
        .map((source) => ({
          projectId: project.id,
          hostId: source.hostId,
          path: source.path as string,
          remote: project.gitRemoteUrl ? githubRepositoryOf(project.gitRemoteUrl) : null,
        })),
    );
    const byProjectRemote = candidates.find((candidate) => candidate.remote === wanted);
    if (byProjectRemote) return byProjectRemote;
    // Projects added before BB recorded gitRemoteUrl: ask git directly.
    const origins = await Promise.all(candidates.map((candidate) => readOriginRepository(candidate.path)));
    const index = origins.indexOf(wanted);
    if (index !== -1) return candidates[index];
    throw new Error(`No BB project has ${pullRequest.owner}/${pullRequest.repo} as its origin.`);
  }

  /**
   * Fetches the PR head into a local branch. `pull/<n>/head` exists for PRs
   * from forks too, unlike `origin/<head branch>`.
   */
  async function fetchPullRequestBranch(checkout: ProjectCheckout, pullRequest: PullRequestRef) {
    const branch = `review/pr-${pullRequest.number}`;
    try {
      await execFileAsync(
        "git",
        ["-C", checkout.path, "fetch", "--no-tags", "origin", `+pull/${pullRequest.number}/head:refs/heads/${branch}`],
        { timeout: 120_000 },
      );
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim();
      throw new Error(`Could not fetch PR #${pullRequest.number}: ${stderr || String(error)}`);
    }
    return branch;
  }

  /**
   * The PR's own title from GitHub, so the thread reads as what the PR is about
   * rather than a bare number. The BB server may not have Homebrew on its PATH,
   * so gh is also tried at its usual install paths. Null on any failure: the
   * review still starts, under the plain numbered title.
   */
  async function readPullRequestTitle(pullRequest: PullRequestRef): Promise<string | null> {
    const args = [
      "pr", "view", String(pullRequest.number),
      "-R", `${pullRequest.owner}/${pullRequest.repo}`,
      "--json", "title", "-q", ".title",
    ];
    for (const gh of ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"]) {
      try {
        const { stdout } = await execFileAsync(gh, args, { timeout: 15_000 });
        return stdout.trim() || null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        return null;
      }
    }
    return null;
  }

  /** Makes `url` the thread's PR through the PR Link plugin's CLI. */
  async function attachPullRequest(threadId: string, url: string): Promise<void> {
    const candidates = [process.env.BB_CLI, `${process.env.HOME}/.bb/bin/bb`, "bb"].filter(Boolean) as string[];
    for (const bin of candidates) {
      try {
        await execFileAsync(bin, ["pr-link", "attach", threadId, url], { timeout: 60_000 });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error("The bb command was not found.");
  }

  async function reviewSectionId(name: string): Promise<string | undefined> {
    if (name === "") return undefined;
    const sections = await bb.sdk.threadSections.list();
    const existing = sections.find((section) => section.name.toLowerCase() === name.toLowerCase());
    return existing ? existing.id : (await bb.sdk.threadSections.create({ name })).id;
  }

  async function startReview(url: string, instructions: string) {
    const pullRequest = parsePullRequestUrl(url);
    if (!pullRequest) throw new Error("Expected https://github.com/OWNER/REPO/pull/NUMBER.");
    const checkout = await findProjectCheckout(pullRequest);
    const [branch, pullRequestTitle] = await Promise.all([
      fetchPullRequestBranch(checkout, pullRequest),
      readPullRequestTitle(pullRequest),
    ]);
    const title = threadTitle(pullRequest.number, pullRequestTitle);
    const config = await settings.get();
    const agent = {
      ...(config.providerId.trim() ? { providerId: config.providerId.trim() } : {}),
      ...(config.model.trim() ? { model: config.model.trim() } : {}),
      ...(config.reasoningLevel.trim() ? { reasoningLevel: config.reasoningLevel.trim() } : {}),
      ...(config.permissionMode !== "project" ? { permissionMode: config.permissionMode as "auto" | "accept-edits" | "full" } : {}),
    };
    const sectionId = await reviewSectionId(config.section.trim());
    const thread = await bb.sdk.threads.spawn({
      projectId: checkout.projectId,
      environment: {
        type: "host",
        hostId: checkout.hostId,
        workspace: { type: "managed-worktree", baseBranch: { kind: "named", name: branch } },
      },
      ...agent,
      ...(sectionId ? { sectionId } : {}),
      title,
      prompt: buildReviewPrompt(config.prompt, pullRequest.url, instructions),
      pluginMetadata: { pullRequestUrl: pullRequest.url },
    });
    bb.log.info(`started review of ${pullRequest.url} in thread ${thread.id}`);
    // The review branch is a local copy (review/pr-N) with no PR of its own,
    // so the thread is attached to the PR explicitly. A failure only costs the
    // sidebar's PR mark; the review itself is already running.
    await attachPullRequest(thread.id, pullRequest.url).catch((error) =>
      bb.log.warn(`could not attach ${pullRequest.url} to ${thread.id}: ${String(error)}`),
    );
    return { threadId: thread.id, title };
  }

  bb.rpc.register(rpcContract, {
    review_start: ({ url, instructions }) => startReview(url, instructions),
  });

  const usage = "Usage: bb review-pr start <pull request URL> [extra instructions...] [--json]";
  bb.cli.register({
    name: "review-pr",
    summary: "Review a GitHub pull request in its own worktree thread",
    commands: [
      {
        name: "start",
        summary: "Check the PR out into a new worktree and start a review agent there",
        usage,
      },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const args = argv.filter((arg) => arg !== "--json");
      // `start` is optional: `bb review-pr <url>` works too.
      const [url, ...rest] = args[0] === "start" ? args.slice(1) : args;
      if (url === undefined || url === "help" || url === "--help" || url === "-h") {
        return { exitCode: url === undefined ? 1 : 0, stdout: usage };
      }
      try {
        const result = await startReview(url, rest.join(" "));
        return {
          exitCode: 0,
          stdout: json ? JSON.stringify(result) : `Started ${result.title} in thread ${result.threadId}`,
        };
      } catch (error) {
        return { exitCode: 1, stderr: error instanceof Error ? error.message : String(error) };
      }
    },
  });
}
