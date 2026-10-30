import { useEffect } from "react";
import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { PR_LINK_PLUGIN_ID, prLinkRpcContract, type ThreadPr } from "./prLinkContract";

type KeyedQuery = (options: {
  contract: typeof prLinkRpcContract;
  pluginId: string;
  method: "pullRequests";
  keys: readonly string[];
  enabled?: boolean;
}) => { data?: Record<string, ThreadPr>; refetch(): Promise<void> };

/**
 * BB's keyed RPC hook, read from the live plugin runtime: this plugin's pinned
 * SDK predates it, so neither its type nor its export exist there. A bb too old
 * to have it gets no PR marks rather than a broken sidebar.
 */
const useRpcKeyedQuery: KeyedQuery =
  (globalThis as unknown as {
    __bbPluginRuntime?: { pluginSdkApp?: { experimental_useRpcKeyedQuery?: KeyedQuery } };
  }).__bbPluginRuntime?.pluginSdkApp?.experimental_useRpcKeyedQuery ??
  (() => ({ data: undefined, refetch: async () => {} }));

type PullRequestState = "open" | "draft" | "merged" | "closed";

/**
 * A pull request reads as a plain "#1234" in the subline's own tone: state
 * and failing checks live in the tooltip, never in colour, so the number does
 * not compete with the row's status slot.
 */
const STATE_LABEL: Record<PullRequestState, string> = {
  open: "Open pull request",
  draft: "Draft pull request",
  merged: "Merged pull request",
  closed: "Closed pull request",
};

/**
 * The chat's pull request from the PR Link plugin: the PR attached to it, or
 * else the PR of its branch. Rows batch into one keyed query and refresh when
 * PR Link invalidates the thread.
 */
export function useThreadPullRequest(threadId: string): PluginSidebarPullRequest | null {
  const { data } = useRpcKeyedQuery({
    contract: prLinkRpcContract,
    pluginId: PR_LINK_PLUGIN_ID,
    method: "pullRequests",
    keys: [threadId],
  });
  const pr = data?.[threadId]?.pr;
  if (!pr) return null;
  return { number: pr.number, title: pr.title, url: pr.url, state: pr.state, attention: "none" } as PluginSidebarPullRequest;
}

type Mutation = (options: {
  contract: typeof prLinkRpcContract;
  pluginId: string;
  method: "attach" | "detach";
}) => { mutate(input: unknown): Promise<unknown> };

const useRpcMutation: Mutation | undefined = (globalThis as unknown as {
  __bbPluginRuntime?: { pluginSdkApp?: { experimental_useRpcMutation?: Mutation } };
}).__bbPluginRuntime?.pluginSdkApp?.experimental_useRpcMutation;
const noMutation = () => ({ mutate: async () => { throw new Error("This bb is too old to attach PRs from the sidebar."); } });

/**
 * Attaches a PR to a chat (or with null goes back to its branch's PR) through
 * PR Link's own mutation. The mutation refreshes this window's copy of the
 * chat's PR as soon as it lands, without waiting for the server's
 * invalidation push, which the desktop app can miss.
 */
export function useAttachPullRequest(): (threadId: string, pr: string | null) => Promise<{ ok: boolean; message: string }> {
  const hook = useRpcMutation ?? noMutation;
  const attach = hook({ contract: prLinkRpcContract, pluginId: PR_LINK_PLUGIN_ID, method: "attach" }).mutate;
  const detach = hook({ contract: prLinkRpcContract, pluginId: PR_LINK_PLUGIN_ID, method: "detach" }).mutate;
  return async (threadId, pr) => {
    try {
      await (pr === null ? detach({ threadId }) : attach({ threadId, pr }));
      return { ok: true, message: "" };
    } catch (cause) {
      return { ok: false, message: cause instanceof Error ? cause.message : String(cause) };
    }
  };
}

const PR_REFRESH_MS = 15_000;

/**
 * Re-reads every row's PR on a beat and when the window comes back. PR Link
 * pushes an invalidation when a chat's PR changes, but the desktop app has
 * been seen to miss it and keep the old number; this bounds how long that lasts.
 * Mounted once by the sidebar: all rows share one keyed query.
 */
export function usePullRequestRefresh() {
  const { refetch } = useRpcKeyedQuery({
    contract: prLinkRpcContract,
    pluginId: PR_LINK_PLUGIN_ID,
    method: "pullRequests",
    keys: [],
    enabled: false,
  });
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void refetch().catch(() => {});
    };
    const timer = window.setInterval(refresh, PR_REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refetch]);
}

/** The PR's number, as one item of the row's subline. */
export function PullRequestBadge({ pullRequest }: { pullRequest: PluginSidebarPullRequest }) {
  const failing =
    pullRequest.attention === "checks_failed" &&
    pullRequest.state !== "merged" &&
    pullRequest.state !== "closed";
  const stateLabel = STATE_LABEL[pullRequest.state];
  const label = failing ? `${stateLabel}, checks failing` : stateLabel;

  return (
    <span
      aria-label={`${label} #${pullRequest.number}`}
      title={`#${pullRequest.number} · ${label.toLowerCase()}`}
      className="shrink-0 tabular-nums"
    >
      #{pullRequest.number}
    </span>
  );
}
