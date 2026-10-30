import type { ReactNode } from "react";
import { experimental_useSidebarThreadActions as useSidebarThreadActions, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { SidebarActions, type SidebarAction } from "./SidebarActions";
import { threadDisplayTitle } from "./inbox";
import { pinActionLabel } from "./pin-scope";
import type { RowSwipeBinding } from "./useRowGesture";

export function RowContextMenu({
  thread,
  onRename,
  onRevealWorkspace,
  onOpenPullRequest,
  onAttachPullRequest,
  onOpen,
  onToggleChildren,
  expanded,
  onTogglePin,
  isPinned,
  onRemoveFromFolder,
  swipeDisabled,
  onReorderStart,
  children,
}: {
  thread: PluginSidebarThread;
  onRename?: () => void;
  /** Present when the chat has a workspace folder on bb's own machine. */
  onRevealWorkspace?: () => void;
  /** Present when the row knows its branch's pull request. */
  onOpenPullRequest?: () => void;
  /** Opens the dialog that picks the PR stack the PR Diffs panel shows. */
  onAttachPullRequest?: () => void;
  onOpen?: () => void;
  onToggleChildren?: () => void;
  expanded?: boolean;
  children: ReactNode;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onRemoveFromFolder?: () => void;
  swipeDisabled?: boolean;
  /** Touch long-press pick-up for a reorder drag; true means it took over. */
  onReorderStart?: (pointerId: number, clientX: number, clientY: number) => boolean;
}) {
  const native = useSidebarThreadActions();
  // Native order (Open, Rename / read + pin / Archive, Delete) with the
  // family-scoped extras alongside their native cousins. Everything else is a
  // plain native call kept for parity.
  const actions: SidebarAction[] = [];
  actions.push({ label: "Open in split", run: () => { native.open(thread.id, { split: true }); onOpen?.(); } });
  if (onRevealWorkspace) actions.push({ label: "Open in Finder", run: onRevealWorkspace });
  if (onOpenPullRequest) actions.push({ label: "Open PR", run: onOpenPullRequest });
  if (onAttachPullRequest) actions.push({ label: "Attach PR…", run: onAttachPullRequest });
  if (onRename) actions.push({ label: "Rename", run: onRename });
  if (onToggleChildren) actions.push({ label: expanded ? "Collapse children" : "Expand children", run: onToggleChildren });
  actions.push({ label: thread.isUnread ? "Mark read" : "Mark unread", run: () => void native.setRead(thread.id, thread.isUnread), separatorBefore: true });
  if (onTogglePin) {
    actions.push({ label: pinActionLabel(isPinned ?? false), run: onTogglePin });
  }
  if (onRemoveFromFolder) actions.push({ label: "Remove family from folder", run: onRemoveFromFolder });
  actions.push({ label: "Archive", run: () => native.archive(thread.id), separatorBefore: true });
  actions.push({ label: "Delete", run: () => native.requestDelete(thread.id), destructive: true });
  // Pin towards the end of the row, archive the other way: pinning is
  // reversible and worth keeping, archiving takes the row away.
  const swipe: RowSwipeBinding | undefined = swipeDisabled
    ? undefined
    : {
        ...(onTogglePin !== undefined
          ? {
              left: {
                label: pinActionLabel(isPinned ?? false),
                icon: isPinned ? "PinOff" : "Pin",
                run: onTogglePin,
              },
            }
          : {}),
        right: {
          label: "Archive",
          icon: "Archive",
          destructive: true,
          run: () => native.archive(thread.id),
        },
      };
  // No hold action: on touch a hold opens this menu, and the menu carries the
  // children toggle. A row with children used to spend its hold on expanding
  // them, which left rename, read, pin, archive and delete out of reach on a
  // phone.
  return (
    <SidebarActions label={threadDisplayTitle(thread)} onReorderStart={onReorderStart} actions={actions} swipe={swipe}>
      {children}
    </SidebarActions>
  );
}
