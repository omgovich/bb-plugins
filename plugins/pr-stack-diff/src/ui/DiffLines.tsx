import { useCallback, useEffect, useMemo, useState } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import {
  GutterUtilitySlotStyles,
  PatchDiff,
  type DiffLineAnnotation,
} from "@pierre/diffs/react";
import { Icon } from "@/components/ui/icon";
import { focusRing } from "./controls";
import { cn } from "@/lib/utils";
import { parseRows } from "./rows";
import { desktopDiffCSS, desktopDiffStyle } from "./diff-theme";
import { desktopSyntaxCSS } from "./syntax-palette";

export interface LineTarget {
  line: number;
  side: "old" | "new";
  code: string;
}

type Side = "additions" | "deletions";

/**
 * A file's diff in BB's own renderer (same engine as the built-in diff view,
 * with GitHub Desktop-style surfaces). Hovering a line shows a "+" in the
 * gutter; it opens a note box sent to the agent through `onSend`.
 */
export function DiffLines({
  patch,
  onSend,
  onNoteOpenChange,
}: {
  patch: string;
  onSend: (target: LineTarget, text: string) => Promise<void>;
  /** Whether a note box is open, so the file keeps it mounted while scrolled away. */
  onNoteOpenChange?: (open: boolean) => void;
}) {
  const codeTheme = useCodeTheme();
  const rows = useMemo(() => parseRows(patch), [patch]);
  // The open note is keyed by side + line number, which a refetch keeps stable.
  const [open, setOpen] = useState<{ side: Side; lineNumber: number } | null>(
    null,
  );

  useEffect(() => {
    onNoteOpenChange?.(open !== null);
  }, [open, onNoteOpenChange]);

  const codeAt = useCallback(
    (side: Side, lineNumber: number): string => {
      const row = rows.find((r) =>
        side === "additions"
          ? r.newNo === lineNumber && r.kind !== "del"
          : r.oldNo === lineNumber && r.kind !== "add",
      );
      return row?.text ?? "";
    },
    [rows],
  );

  const annotations: DiffLineAnnotation[] =
    open === null ? [] : [{ side: open.side, lineNumber: open.lineNumber }];

  return (
    <PatchDiff
      patch={patch}
      options={{
        diffStyle: "unified",
        overflow: "scroll",
        disableFileHeader: true,
        theme: codeTheme.name,
        unsafeCSS: `${desktopDiffCSS}\n${desktopSyntaxCSS(codeTheme.theme, codeTheme.mode)}`,
        diffIndicators: "classic",
        hunkSeparators: "metadata",
        themeType: codeTheme.mode,
        lineHoverHighlight: "both",
        enableGutterUtility: true,
      }}
      style={desktopDiffStyle(codeTheme.mode)}
      lineAnnotations={annotations}
      renderGutterUtility={(getHoveredLine) => (
        <button
          type="button"
          title="Note for the agent"
          style={GutterUtilitySlotStyles}
          className="flex size-4 items-center justify-center rounded bg-primary text-[11px] leading-none text-primary-foreground"
          onClick={() => {
            const hovered = getHoveredLine();
            if (hovered)
              setOpen({ side: hovered.side, lineNumber: hovered.lineNumber });
          }}
        >
          <Icon name="Plus" className="size-3" />
        </button>
      )}
      renderAnnotation={(annotation) => (
        <NoteBox
          onCancel={() => setOpen(null)}
          onSend={async (text) => {
            await onSend(
              {
                line: annotation.lineNumber,
                side: annotation.side === "deletions" ? "old" : "new",
                code: codeAt(annotation.side, annotation.lineNumber),
              },
              text,
            );
          }}
        />
      )}
    />
  );
}

function NoteBox({
  onSend,
  onCancel,
}: {
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const send = async () => {
    if (text.trim() === "" || state === "sending") return;
    setState("sending");
    try {
      await onSend(text.trim());
      setState("sent");
      setText("");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="mx-2 my-2 rounded-lg border border-border bg-background p-3 font-sans text-xs">
      <div className="mb-2 flex items-center gap-1.5 font-medium">
        <Icon name="MessageSquare" className="size-3.5 text-muted-foreground" />
        Note to agent
      </div>
      <textarea
        autoFocus
        aria-label="Note to agent"
        disabled={state === "sending"}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (state !== "sending") setState("idle");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            void send();
          if (event.key === "Escape") onCancel();
        }}
        placeholder="Note for the agent…"
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-background p-2 outline-none focus:border-ring"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={text.trim() === "" || state === "sending"}
          className={cn(
            "rounded-md bg-primary px-2.5 py-1.5 text-primary-foreground disabled:opacity-50",
            focusRing,
          )}
        >
          {state === "sending" ? "Sending…" : "Send to agent"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "rounded px-1 py-1.5 text-muted-foreground hover:text-foreground",
            focusRing,
          )}
        >
          Cancel
        </button>
        <span role="status" className="ml-auto text-muted-foreground">
          {state === "sent"
            ? "Sent"
            : state === "error"
              ? "Could not send"
              : "⌘↵ to send"}
        </span>
      </div>
    </div>
  );
}
