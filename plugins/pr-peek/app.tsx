// A tooltip for links to GitHub pull requests anywhere in the app: hover (or
// focus) one and its title, state, author and size show up under it.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_useRpcKeyedQuery as useRpcKeyedQuery,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { prPeekRpcContract, type PrPeek } from "./src/contract";
import { parsePullUrl, prKey } from "./src/refs";

/** Hover this long before the tooltip opens, so sweeping across text stays quiet. */
const OPEN_DELAY_MS = 300;
/** Grace for moving the pointer from the link onto the tooltip. */
const CLOSE_DELAY_MS = 150;
const GAP = 6;

interface Target {
  key: string;
  anchor: HTMLAnchorElement;
}

const STATE: Record<PrPeek["state"], { label: string; icon: string; className: string }> = {
  open: { label: "Open", icon: "GitPullRequest", className: "text-[var(--success,#1a7f37)]" },
  draft: { label: "Draft", icon: "GitPullRequestDraft", className: "text-muted-foreground" },
  merged: { label: "Merged", icon: "GitMerge", className: "text-[#8250df]" },
  closed: { label: "Closed", icon: "GitPullRequestClosed", className: "text-destructive" },
};

/** The pull-request link an event happened on, if any. */
function pullLinkOf(node: EventTarget | null): { anchor: HTMLAnchorElement; key: string } | null {
  if (!(node instanceof Element)) return null;
  const anchor = node.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  const ref = parsePullUrl(anchor.href);
  return ref ? { anchor, key: prKey(ref) } : null;
}

function PrPeekOverlay() {
  const [target, setTarget] = useState<Target | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const overTooltip = useRef(false);

  useEffect(() => {
    const clear = (timer: { current: number | null }) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const show = (next: Target) => {
      clear(closeTimer);
      clear(openTimer);
      openTimer.current = window.setTimeout(() => setTarget(next), OPEN_DELAY_MS);
    };
    const hide = () => {
      clear(openTimer);
      clear(closeTimer);
      closeTimer.current = window.setTimeout(() => {
        if (!overTooltip.current) setTarget(null);
      }, CLOSE_DELAY_MS);
    };
    const onOver = (event: Event) => {
      const link = pullLinkOf(event.target);
      if (link) show(link);
    };
    const onOut = (event: Event) => {
      const from = pullLinkOf(event.target);
      const to = pullLinkOf((event as MouseEvent | FocusEvent).relatedTarget);
      if (from && from.anchor !== to?.anchor) hide();
    };
    const dismiss = () => {
      clear(openTimer);
      clear(closeTimer);
      overTooltip.current = false;
      setTarget(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", onOut);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      clear(openTimer);
      clear(closeTimer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", onOut);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, []);

  if (target === null) return null;
  return (
    <Tooltip
      target={target}
      onPointerEnter={() => {
        overTooltip.current = true;
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      }}
      onPointerLeave={() => {
        overTooltip.current = false;
        setTarget(null);
      }}
    />
  );
}

function Tooltip({
  target,
  onPointerEnter,
  onPointerLeave,
}: {
  target: Target;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const { data, isLoading } = useRpcKeyedQuery({
    contract: prPeekRpcContract,
    method: "pullRequests",
    keys: [target.key],
  });
  const result = data?.[target.key];
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Under the link, or above it when there is no room; kept inside the window.
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const link = target.anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const left = Math.min(Math.max(8, link.left), window.innerWidth - width - 8);
    const below = link.bottom + GAP;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, link.top - GAP - height) : below;
    setPosition({ left, top });
  }, [target, result, isLoading]);

  const [repo, number] = target.key.split("#");
  const pr = result?.pr ?? null;
  const state = pr ? STATE[pr.state] : null;
  return (
    <div
      ref={box}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ left: position?.left ?? -9999, top: position?.top ?? -9999 }}
      className="fixed z-[1000] w-max max-w-[min(420px,calc(100vw-16px))] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {state ? <Icon name={state.icon} className={cn("size-3.5 shrink-0", state.className)} /> : null}
        <span className="truncate">
          {repo} #{number}
        </span>
        {state ? <span className={cn("shrink-0", state.className)}>· {state.label}</span> : null}
      </div>
      {pr ? (
        <>
          <div className="mt-1 text-[13px] font-medium leading-snug">{pr.title}</div>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
            {pr.author ? <span>@{pr.author}</span> : null}
            <span className="tabular-nums">
              <span className="text-[var(--diff-added,#1a7f37)]">+{pr.additions}</span>{" "}
              <span className="text-[var(--diff-removed,#cf222e)]">−{pr.deletions}</span>
            </span>
            <span className="tabular-nums">
              {pr.changedFiles} {pr.changedFiles === 1 ? "file" : "files"}
            </span>
          </div>
        </>
      ) : (
        <div className="mt-1 text-muted-foreground">
          {result?.error ? `Could not load: ${result.error}` : "Loading…"}
        </div>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "pr-peek", component: PrPeekOverlay });
});
