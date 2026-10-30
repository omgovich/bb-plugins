import {
  definePluginApp,
  experimental_DetailRow as DetailRow,
  experimental_THREAD_INFO_ROW_GROUPS as ROW_GROUPS,
  experimental_useRpcKeyedQuery as useRpcKeyedQuery,
  UrlLink,
} from "@get-bb/plugin-sdk/app";
import { prLinkRpcContract } from "./src/contract";

/** The chat's pull request in the thread Info tab, with where it came from. */
function PullRequestRow({ threadId }: { threadId: string }) {
  const { data } = useRpcKeyedQuery({ contract: prLinkRpcContract, method: "pullRequests", keys: [threadId] });
  const value = data?.[threadId];
  // A failed lookup (gh missing or logged out, PR gone) is shown, not hidden,
  // so a new install has something to act on.
  if (!value?.pr && value?.error)
    return (
      <DetailRow label="Pull request" icon="GitPullRequest">
        <span className="truncate text-xs text-muted-foreground" title={value.error}>
          Could not read: {value.error}
        </span>
      </DetailRow>
    );
  if (!value?.pr) return null;
  const { pr } = value;
  return (
    <DetailRow label="Pull request" icon="GitPullRequest">
      <span className="flex min-w-0 items-center gap-1.5">
        <UrlLink href={pr.url} className="truncate">
          #{pr.number} {pr.title}
        </UrlLink>
        <span className="shrink-0 text-xs text-muted-foreground">
          {pr.state}
          {value.mode === "attached" ? " · attached" : ""}
        </span>
      </span>
    </DetailRow>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadInfoRow({
    id: "pull-request",
    group: ROW_GROUPS.pullRequest,
    order: 10,
    component: PullRequestRow,
  });
});
