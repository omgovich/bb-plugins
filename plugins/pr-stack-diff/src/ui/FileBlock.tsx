import { memo, useEffect, useRef, useState } from "react";
import { experimental_copyToClipboard as copyToClipboard } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { IconButton, focusRing } from "./controls";
import { cn } from "@/lib/utils";
import type { PanelFile } from "../server";
import { DiffLines, type LineTarget } from "./DiffLines";
import { isGeneratedPath } from "../generated";

/** Files this big start folded, so a large PR opens fast. */
const BIG_FILE_LINES = 400;
/** A rendered diff further than this from the viewport is swapped for a blank of its height. */
const KEEP_MARGIN = "1500px 0px";
/** A diff that has not rendered yet starts rendering this close to the viewport. */
const RENDER_MARGIN = "800px 0px";

export const FileBlock = memo(function FileBlock({
  file,
  viewed,
  onViewedChange,
  onSend,
  onOpenFile,
}: {
  file: PanelFile;
  viewed: boolean;
  onViewedChange: (file: PanelFile, viewed: boolean) => void;
  onOpenFile?: (file: PanelFile) => boolean;
  onSend: (file: PanelFile, target: LineTarget, text: string) => Promise<void>;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [openError, setOpenError] = useState(false);
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  const big = file.additions + file.deletions > BIG_FILE_LINES;
  const generated = isGeneratedPath(file.path);
  const [open, setOpen] = useState(!viewed && !big && !generated);
  // Marking Viewed folds the file; losing the mark (its edits changed) opens it
  // again so the change is not missed.
  const wasViewed = useRef(viewed);
  useEffect(() => {
    if (viewed && !wasViewed.current) setOpen(false);
    if (!viewed && wasViewed.current) setOpen(true);
    wasViewed.current = viewed;
  }, [viewed]);

  // Diff rows render only near the viewport, and a rendered diff that scrolls
  // far away is swapped for a blank of its last height, so a long PR keeps a
  // small DOM. An open note keeps its file mounted.
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const height = useRef<number | null>(null);
  const [near, setNear] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  useEffect(() => {
    if (!open || ref.current === null) return;
    // Margins only reach past the scrolling list when it is the root.
    const root = ref.current.closest<HTMLElement>("[data-diff-scroll]");
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root, rootMargin: near ? KEEP_MARGIN : RENDER_MARGIN },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [open, near]);
  useEffect(() => {
    const element = body.current;
    if (!near || element === null) return;
    const observer = new ResizeObserver(() => {
      height.current = element.offsetHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  const rendered = near || noteOpen;

  return (
    <div
      ref={ref}
      data-file-path={file.path}
      className="overflow-clip rounded-lg border border-border bg-background"
    >
      <div className="sticky top-0 z-10 flex h-9 items-center gap-1.5 bg-background px-2 text-xs">
        <button
          type="button"
          data-file-toggle
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted",
            focusRing,
          )}
          aria-label={`${open ? "Collapse" : "Expand"} ${file.path}`}
        >
          <Icon
            name="ChevronRight"
            className={cn(
              "size-3.5 motion-safe:transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cn(
            "min-w-0 flex-1 truncate rounded font-mono text-[12px] [direction:rtl] text-left hover:text-foreground",
            focusRing,
            viewed && "text-muted-foreground",
          )}
          title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        >
          <bdi>
            {file.oldPath ? `${file.oldPath} → ` : ""}
            {file.path}
          </bdi>
        </button>
        <IconButton
          icon={
            copyState === "copied"
              ? "Check"
              : copyState === "error"
                ? "AlertCircle"
                : "Copy"
          }
          label={
            copyState === "copied"
              ? "Path copied"
              : copyState === "error"
                ? "Could not copy path"
                : `Copy path for ${file.path}`
          }
          className="size-5"
          onClick={async () => {
            try {
              setCopyState(
                (await copyToClipboard({ text: file.path }))
                  ? "copied"
                  : "error",
              );
            } catch {
              setCopyState("error");
            }
          }}
        />
        {onOpenFile && file.status !== "deleted" ? (
          <IconButton
            icon="ExternalLink"
            label={`Open ${file.path} in editor (current workspace)`}
            className="size-5"
            onClick={() => setOpenError(!onOpenFile(file))}
          />
        ) : null}
        {file.status === "added" || file.status === "deleted" ? (
          <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
            {file.status === "added" ? "new" : "deleted"}
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[12px] tabular-nums">
          {file.additions > 0 ? (
            <span className="text-[var(--diff-added,#2da44e)]">
              +{file.additions}
            </span>
          ) : null}
          {file.additions > 0 && file.deletions > 0 ? " " : null}
          {file.deletions > 0 ? (
            <span className="text-[var(--diff-removed,#cf222e)]">
              -{file.deletions}
            </span>
          ) : null}
        </span>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pl-1 text-muted-foreground">
          <input
            type="checkbox"
            aria-label={`Viewed ${file.path}`}
            className={cn("size-3.5 accent-primary", focusRing)}
            checked={viewed}
            onChange={(event) => onViewedChange(file, event.target.checked)}
          />
          Viewed
        </label>
      </div>
      {openError ? (
        <div role="alert" className="px-3 pb-2 text-xs text-destructive">
          Could not open the file in your editor.
        </div>
      ) : null}
      {open ? (
        <div className="overflow-hidden rounded-b-lg border-t border-border">
          {file.binary ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Binary file
            </div>
          ) : rendered ? (
            // bb closes the side panel on a sideways swipe on phones; a swipe
            // that starts on the code scrolls it instead.
            <div ref={body} className="overflow-x-auto" data-no-secondary-panel-swipe="">
              <DiffLines
                patch={file.patch}
                onSend={(target, text) => onSend(file, target, text)}
                onNoteOpenChange={setNoteOpen}
              />
            </div>
          ) : height.current !== null ? (
            <div aria-hidden style={{ height: height.current }} />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Loading…
            </div>
          )}
        </div>
      ) : (big || generated) && !viewed ? (
        <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          {generated ? "Generated file folded." : "Large diff folded."} Expand this file to review it.
        </div>
      ) : null}
    </div>
  );
});
