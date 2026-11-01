import {
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
} from "react";
import {
  useRealtime,
  useRpc,
  useSdk,
  useBbNavigate,
  experimental_useRpcKeyedQuery as useRpcKeyedQuery,
  experimental_useRpcMutation as useRpcMutation,
} from "@get-bb/plugin-sdk/app";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { IconButton, focusRing } from "./controls";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import type { PanelEntry, PanelFile, prStackDiffRpcContract } from "../server";
import { stackChannel } from "../refs";
import { PR_LINK_PLUGIN_ID, prLinkRpcContract } from "../prLinkContract";
import type { LineTarget } from "./DiffLines";
import { FileBlock } from "./FileBlock";
import { isViewed, loadViewed, saveViewed, UNVIEWED, viewedKey } from "./viewed";
import { isTestPath } from "../generated";

type Source = "github" | "local";
interface StackState {
  repo: string | null;
  mode: "auto" | "attached";
  currentBranch: string | null;
  focusBranch?: string | null;
  entries: PanelEntry[];
  error: string | null;
}

/** How often the open panel re-reads the stack to pick up commits and pushes. */
const POLL_MS = 15_000;
/** Below this header width the GitHub/Local switch shows icons only. */
const COMPACT_HEADER_PX = 480;

export function Panel({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof prStackDiffRpcContract>();
  const [refreshing, setRefreshing] = useState(false);
  const [stack, setStack] = useState<StackState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);

  const loadStack = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = (await rpc.call("getStack", {
        threadId,
      })) as unknown as StackState;
      // An unchanged poll keeps the same object, so the diff below does not re-render.
      setStack((current) =>
        current !== null && JSON.stringify(current) === JSON.stringify(next)
          ? current
          : next,
      );
    } catch (error) {
      setStack((current) => ({
        ...(current ?? emptyStack()),
        error: String(error),
      }));
    } finally {
      setRefreshing(false);
    }
  }, [rpc, threadId]);

  useEffect(() => {
    void loadStack();
    const timer = window.setInterval(() => void loadStack(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadStack]);
  useRealtime(stackChannel(threadId), () => void loadStack());
  // The chat's PR can change elsewhere (the sidebar's Attach PR, a branch
  // switch): PR Link invalidates it, and the stack is re-read at once.
  const { data: prLink } = useRpcKeyedQuery({
    contract: prLinkRpcContract,
    pluginId: PR_LINK_PLUGIN_ID,
    method: "pullRequests",
    keys: [threadId],
  });
  // Attaching through PR Link's own mutation refreshes this window's copy of
  // the chat's PR (the sidebar's too) as soon as it lands, not only when the
  // server's invalidation push arrives.
  const { mutate: attachPr } = useRpcMutation({
    contract: prLinkRpcContract,
    pluginId: PR_LINK_PLUGIN_ID,
    method: "attach",
  });
  const linked = prLink?.[threadId];
  const linkedKey = linked ? `${linked.mode}:${linked.pr?.repo ?? ""}#${linked.pr?.number ?? ""}` : null;
  const firstLink = useRef(true);
  useEffect(() => {
    if (linkedKey === null) return;
    if (firstLink.current) {
      firstLink.current = false;
      return;
    }
    // Follow the chat's PR: the stack re-centres on it and the picker shows it.
    const linkedHead = linked?.pr?.headRefName ?? null;
    setSelected((current) => (current === linkedHead ? current : null));
    void loadStack();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per change of the chat's PR
  }, [linkedKey, loadStack]);

  const entries = stack?.entries ?? [];
  const entry =
    entries.find((e) => e.headRef === selected) ??
    entries.find((e) => e.headRef === stack?.focusBranch) ??
    entries.find((e) => e.headRef === stack?.currentBranch) ??
    entries.at(-1) ??
    null;
  const effectiveSource: Source =
    source ?? (entry?.localOid ? "local" : "github");
  const localAvailable = entry?.localOid != null;
  const githubAvailable = entry?.number != null;
  const activeSource: Source =
    effectiveSource === "local" && !localAvailable
      ? "github"
      : effectiveSource === "github" && !githubAvailable
        ? "local"
        : effectiveSource;

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <Header
        refreshing={refreshing}
        stack={stack}
        entry={entry}
        source={activeSource}
        localAvailable={localAvailable}
        githubAvailable={githubAvailable}
        onSelect={(headRef) => {
          setSelected(headRef);
          // Picking a PR makes it the chat's PR (through PR Link), so the
          // sidebar and the chat's other PR surfaces follow the review.
          const picked = entries.find((e) => e.headRef === headRef);
          if (picked?.number != null && stack?.repo) {
            void attachPr({ threadId, pr: `${stack.repo}#${picked.number}` })
              .then(() => loadStack())
              .catch(() => {});
          }
        }}
        onSource={setSource}
        onRefresh={() => void loadStack()}
        onAttach={async (pr) => {
          await attachPr({ threadId, pr });
          await loadStack();
        }}
      />
      {stack === null ? (
        <Empty icon="Loading" title="Finding pull requests">
          Reading this chat’s branches and stack…
        </Empty>
      ) : entry === null ? (
        <Empty
          icon={stack.error ? "AlertCircle" : "GitPullRequest"}
          title={
            stack.error
              ? "Could not load pull requests"
              : "No pull requests yet"
          }
        >
          {stack.error ??
            "Attach a PR above to review its stack here. Local branches appear automatically."}
        </Empty>
      ) : (
        <DiffView
          key={`${entry.headRef}:${activeSource}`}
          threadId={threadId}
          repo={stack.repo ?? "local"}
          entry={entry}
          source={activeSource}
        />
      )}
    </div>
  );
}

function emptyStack(): StackState {
  return {
    repo: null,
    mode: "auto",
    currentBranch: null,
    entries: [],
    error: null,
  };
}

function ApprovalMark({ label = false }: { label?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[var(--success,#22863a)]"
      title="Approved on GitHub"
      aria-label="Approved on GitHub"
    >
      <Icon name="CircleCheck" className="size-3.5" aria-hidden />
      {label ? <span className="text-[10px]">Approved</span> : null}
    </span>
  );
}

function prIcon(state?: PanelEntry["state"]) {
  return state === "merged"
    ? "GitMerge"
    : state === "draft"
      ? "GitPullRequestDraft"
      : state === "closed"
        ? "GitPullRequestClosed"
        : "GitPullRequest";
}

function Header({
  stack,
  entry,
  source,
  localAvailable,
  githubAvailable,
  refreshing,
  onSelect,
  onSource,
  onRefresh,
  onAttach,
}: {
  stack: StackState | null;
  entry: PanelEntry | null;
  source: Source;
  localAvailable: boolean;
  githubAvailable: boolean;
  refreshing: boolean;
  onSelect: (headRef: string) => void;
  onSource: (source: Source) => void;
  onRefresh: () => void;
  onAttach: (pr: string) => Promise<void>;
}) {
  const attachId = useId();
  // A narrow panel (a phone, a squeezed split) keeps the source switch to its
  // icons, so the PR picker keeps room for the PR's title.
  const row = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = row.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 0) < COMPACT_HEADER_PX));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const portalScope = usePortalScopeProps();
  const [attaching, setAttaching] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entries = stack?.entries ?? [];
  const index = entries.findIndex((e) => e.headRef === entry?.headRef);
  const navigate = useBbNavigate();
  const prUrl =
    stack?.repo && entry?.number != null
      ? `https://github.com/${stack.repo}/pull/${entry.number}`
      : null;
  return (
    <div className="shrink-0 border-b border-border bg-background">
      <div ref={row} className="flex items-center gap-1.5 px-2 py-1.5">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              disabled={!entry}
              aria-label={
                entry
                  ? `Select pull request: ${entry.number === null ? entry.headRef : `#${entry.number}`} ${entry.title}${entry.approved ? ", approved on GitHub" : ""}${entries.length > 1 ? `, ${index + 1} of ${entries.length} in stack` : ""}`
                  : "Select pull request"
              }
              title={
                entry
                  ? `${entry.title}${entry.approved ? " · Approved on GitHub" : ""}\n${entry.headRef} → ${entry.baseRef}`
                  : "No pull requests"
              }
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-state-hover disabled:opacity-50",
                focusRing,
              )}
            >
              <Icon
                name={prIcon(entry?.state)}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span
                className={cn(
                  "font-medium tabular-nums",
                  entry?.number != null ? "shrink-0" : "truncate",
                )}
              >
                {entry
                  ? entry.number === null
                    ? entry.headRef
                    : `#${entry.number}`
                  : "Pull requests"}
              </span>
              {entry?.number != null ? (
                <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                  {entry.title}
                </span>
              ) : null}
              {entry?.approved ? <ApprovalMark /> : null}
              {entry?.diverged ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                  aria-label="Local branch differs from GitHub"
                />
              ) : null}
              {entries.length > 1 ? (
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                  {index + 1} / {entries.length}
                </span>
              ) : null}
              <Icon
                name="ChevronDown"
                className="ml-auto size-3 shrink-0 text-muted-foreground"
              />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              {...portalScope}
              align="start"
              sideOffset={4}
              collisionPadding={8}
              style={{
                width: "min(440px, calc(100vw - 24px))",
                maxHeight:
                  "min(420px, var(--radix-dropdown-menu-content-available-height))",
              }}
              className="z-50 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <DropdownMenu.Label className="px-2 py-1.5 text-xs text-muted-foreground">
                {entries.length > 1
                  ? `Pull request stack · ${entries.length} PRs`
                  : "Pull request"}
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={entry?.headRef ?? ""}
                onValueChange={onSelect}
              >
                {[...entries].reverse().map((e, i) => (
                  <DropdownMenu.RadioItem
                    key={e.headRef}
                    value={e.headRef}
                    textValue={`${e.number ?? ""} ${e.title} ${e.headRef}`}
                    title={`${e.title}${e.approved ? " · Approved on GitHub" : ""}\n${e.headRef} → ${e.baseRef}`}
                    className="relative flex h-8 cursor-default items-center gap-2 whitespace-nowrap rounded-md pl-7 pr-2 outline-none data-[highlighted]:bg-state-hover data-[state=checked]:bg-state-active"
                  >
                    <DropdownMenu.ItemIndicator className="absolute left-2 top-1/2 -translate-y-1/2">
                      <Icon name="Check" className="size-3.5" />
                    </DropdownMenu.ItemIndicator>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                      <Icon
                        name={prIcon(e.state)}
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          e.number === null ? "max-w-32 truncate" : "shrink-0",
                        )}
                      >
                        {e.number === null ? e.headRef : `#${e.number}`}
                      </span>
                      {e.state !== "open" && e.state !== "local" ? (
                        <span className="text-muted-foreground">{e.state}</span>
                      ) : null}
                      {e.diverged ? (
                        <span
                          className="size-1.5 rounded-full bg-amber-500"
                          title="Local branch differs from GitHub"
                          aria-label="Local branch differs from GitHub"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {e.title}
                      </span>
                      {e.approved ? <ApprovalMark label /> : null}
                      {entries.length > 1 ? (
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {entries.length - i} / {entries.length}
                        </span>
                      ) : null}
                    </div>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <div
          role="group"
          aria-label="Diff source"
          className="inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5 text-xs"
        >
          {(["github", "local"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={source === item}
              disabled={item === "github" ? !githubAvailable : !localAvailable}
              onClick={() => onSource(item)}
              aria-label={item === "github" ? "GitHub" : "Local"}
              title={
                item === "local"
                  ? "Committed changes in the local branch"
                  : "Changes published to GitHub"
              }
              className={cn(
                "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md disabled:opacity-40",
                compact ? "px-2" : "px-2.5",
                focusRing,
                source === item
                  ? "bg-state-active text-foreground"
                  : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
              )}
            >
              <Icon
                name={item === "github" ? "Github" : "Laptop"}
                className="size-3.5 shrink-0"
              />
              {compact ? null : item === "github" ? "GitHub" : "Local"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {prUrl ? (
            <IconButton
              icon="ExternalLink"
              label="Open PR on GitHub"
              onClick={() => {
                if (!navigate.openUrl(prUrl)) window.open(prUrl, "_blank", "noopener");
              }}
            />
          ) : null}
          <IconButton
            icon="Link"
            label="Attach PR"
            aria-expanded={attaching}
            onClick={() => {
              setAttaching(!attaching);
              setError(null);
            }}
          />
          <IconButton
            icon="ArrowReloadHorizontal"
            label="Refresh pull requests"
            disabled={refreshing}
            onClick={onRefresh}
            className={refreshing ? "motion-safe:animate-pulse" : ""}
          />
        </div>
      </div>
      {attaching ? (
        <form
          className="space-y-2 border-t border-border bg-muted/30 px-3 py-2.5"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await onAttach(value.trim());
              setAttaching(false);
              setValue("");
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label
            htmlFor={attachId}
            className="block text-xs text-muted-foreground"
          >
            Attach a PR to use its stack instead of automatic detection.
          </label>
          <div className="flex items-center gap-2">
            <input
              id={attachId}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="PR URL or number"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
            />
            <button
              type="submit"
              disabled={busy || value.trim() === ""}
              className={cn(
                "rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50",
                focusRing,
              )}
            >
              {busy ? "Attaching…" : "Attach"}
            </button>
            <IconButton
              icon="X"
              label="Cancel attachment"
              onClick={() => setAttaching(false)}
            />
          </div>
        </form>
      ) : null}
      {error || (stack?.error && entry) ? (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 pb-2 text-xs text-destructive"
        >
          <Icon name="AlertCircle" className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{error ?? stack?.error}</span>
        </div>
      ) : null}
    </div>
  );
}

function DiffView({
  threadId,
  repo,
  entry,
  source,
}: {
  threadId: string;
  repo: string;
  entry: PanelEntry;
  source: Source;
}) {
  const rpc = useRpc<typeof prStackDiffRpcContract>();
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void sdk.threads
      .get({ threadId })
      .then((thread) => {
        if (!cancelled) setEnvironmentId(thread.environmentId ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sdk, threadId]);
  const onOpenFile = useCallback(
    (file: PanelFile) => {
      if (environmentId)
        return navigate.experimental_openFileExternally({
          target: { kind: "workspace", environmentId, path: file.path },
          location: null,
        });
      return false;
    },
    [environmentId, navigate],
  );
  // Refetch when the branch tip moves (new commit or push).
  const version = source === "local" ? entry.localOid : entry.remoteOid;
  const [whitespaceHidden, setWhitespaceHidden] = useState(true);
  const [files, setFiles] = useState<PanelFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>(() =>
    loadViewed(),
  );
  useEffect(() => {
    let cancelled = false;
    void rpc
      .call("getDiff", {
        threadId,
        headRef: entry.headRef,
        baseRef: entry.baseRef,
        number: entry.number,
        source,
      })
      .then((result) => {
        if (cancelled) return;
        setFiles(result.files);
        setWhitespaceHidden(result.whitespaceHidden);
        setError(result.error);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [
    rpc,
    threadId,
    entry.headRef,
    entry.baseRef,
    entry.number,
    source,
    version,
  ]);

  const prKey = entry.number ?? entry.headRef;
  // Stable across polls and Viewed toggles so memoized file blocks skip re-rendering.
  const latest = useRef({ entry, source, repo, prKey });
  latest.current = { entry, source, repo, prKey };
  const onViewedChange = useCallback((file: PanelFile, viewed: boolean) => {
    const { repo, prKey, source } = latest.current;
    const key = viewedKey(repo, prKey, source, file.path);
    setMarks((current) => {
      const next = { ...loadViewed(), ...current };
      if (viewed) next[key] = file.fingerprint;
      else if (isTestPath(file.path)) next[key] = UNVIEWED;
      else delete next[key];
      saveViewed(next);
      return next;
    });
  }, []);
  const onSend = useCallback(
    async (file: PanelFile, target: LineTarget, text: string) => {
      const { entry, source } = latest.current;
      await rpc.call("sendComment", {
        threadId,
        number: entry.number,
        headRef: entry.headRef,
        source,
        path: file.path,
        line: target.line,
        code: target.code,
        text,
      });
    },
    [rpc, threadId],
  );
  const totals = useMemo(
    () =>
      (files ?? []).reduce(
        (sum, f) => ({
          add: sum.add + f.additions,
          del: sum.del + f.deletions,
        }),
        { add: 0, del: 0 },
      ),
    [files],
  );

  if (error && (files === null || files.length === 0))
    return (
      <Empty icon="AlertCircle" title="Could not load this diff">
        {error}
      </Empty>
    );
  if (files === null)
    return (
      <Empty icon="Loading" title="Loading diff">
        Preparing the changed files…
      </Empty>
    );
  if (files.length === 0)
    return (
      <Empty icon="Check" title="No changes to review">
        No changes against {entry.baseRef}. Whitespace-only edits are hidden.
      </Empty>
    );

  const viewedCount = files.filter((f) =>
    isViewed(marks[viewedKey(repo, prKey, source, f.path)], f.fingerprint, isTestPath(f.path)),
  ).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1 text-xs">
        <span className="shrink-0 font-medium">{files.length} files</span>
        <span className="tabular-nums text-[var(--diff-added,#2da44e)]">
          +{totals.add}
        </span>
        <span className="tabular-nums text-[var(--diff-removed,#cf222e)]">
          −{totals.del}
        </span>
        <span
          className="shrink-0 text-muted-foreground"
          title={
            whitespaceHidden
              ? "Whitespace-only changes are hidden"
              : "Could not fetch this PR; showing GitHub’s original diff."
          }
        >
          <Icon
            name={whitespaceHidden ? "EyeOff" : "AlertTriangle"}
            className="size-3"
            aria-label={
              whitespaceHidden ? "Whitespace hidden" : "Whitespace included"
            }
          />
        </span>
        <div
          className="ml-auto h-1 min-w-4 max-w-20 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Files reviewed"
          aria-valuemin={0}
          aria-valuemax={files.length}
          aria-valuenow={viewedCount}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(viewedCount / files.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {viewedCount === files.length
            ? "All files viewed"
            : `${viewedCount}/${files.length} viewed`}
        </span>
      </div>
      {error ? (
        <div role="alert" className="px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <div data-diff-scroll className="min-h-0 flex-1 overflow-y-auto px-2">
        <div className="flex flex-col gap-2 py-2">
          {files.map((file) => (
            <FileBlock
              key={file.path}
              file={file}
              viewed={isViewed(
                marks[viewedKey(repo, prKey, source, file.path)],
                file.fingerprint,
                isTestPath(file.path),
              )}
              onViewedChange={onViewedChange}
              onSend={onSend}
              onOpenFile={environmentId ? onOpenFile : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Empty({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: string;
  title: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-12 text-center"
    >
      <Icon
        name={icon}
        className={cn(
          "mb-1 size-6 text-muted-foreground",
          icon === "Loading" && "motion-safe:animate-spin",
        )}
      />
      <div className="text-sm font-medium">{title}</div>
      <div className="max-w-72 text-xs leading-5 text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
