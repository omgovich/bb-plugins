import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { isActivityIndicator } from "./StatusGlyph";
import { relativeTimeLabel } from "./relative-time";
import type { ThreadStatusKind } from "./status";
import { isWorking } from "./activity";

/**
 * A comet orbiting the slot: a fading arc with a bright head. Pure CSS (see
 * .cs-spinner in app.css) so it follows currentColor and reduced motion.
 */
export function ActivitySpinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={cn("cs-spinner", className)}
    />
  );
}

function activityStatusKind(status: ThreadStatusKind | undefined): boolean {
  return status === "working";
}

/**
 * The row's trailing slot, where the age would sit: a spinner while the
 * thread works, a coloured dot when it wants attention (red failed, amber
 * waiting on you, blue unread), else the age when Show > Updated is on.
 */
export function ThreadTrailingStatus({
  thread,
  exactStatus,
  label,
  now,
  showAge,
}: {
  thread: PluginSidebarThread;
  exactStatus: ThreadStatusKind | undefined;
  label: string | null;
  now: number;
  showAge: boolean;
}) {
  const working =
    activityStatusKind(exactStatus) ||
    isWorking(thread) ||
    isActivityIndicator(thread.indicator);
  if (working) {
    return <ActivitySpinner label={label ?? "Working"} className="size-3.5 shrink-0" />;
  }
  const tone =
    exactStatus === "failed" || thread.indicator === "unread-error"
      ? "bg-destructive"
      : exactStatus === "input" || thread.indicator === "waiting-for-input"
        ? "bg-warning-text"
        : thread.indicator === "unread-success" || thread.isUnread
          ? "cs-unread-dot"
          : null;
  if (tone !== null) {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <span role="img" aria-label={label ?? "Unread"} className={cn("size-2 rounded-full", tone)} />
      </span>
    );
  }
  return showAge ? <ThreadAge thread={thread} now={now} /> : null;
}

/** The trailing age label. Status lives in the left slot, never here. */
export function ThreadAge({ thread, now }: { thread: PluginSidebarThread; now: number }) {
  return (
    <span
      className={cn(
        "tabular-nums text-xs text-sidebar-foreground/73",
      )}
    >
      {relativeTimeLabel(thread.updatedAt, now)}
    </span>
  );
}
