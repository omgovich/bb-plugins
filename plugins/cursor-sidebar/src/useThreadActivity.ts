import { useEffect, useRef, useState } from "react";
import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { isWorking } from "./activity";
import { isActivityIndicator } from "./StatusGlyph";
import type { cursorSidebarRpcContract } from "./server";

/** Working chats change between sidebar updates, so they are re-read on a beat. */
const WORKING_REFRESH_MS = 8000;

/**
 * The chats worth a line: one that is working, or one with news you have not
 * read. A read, idle chat says nothing, so it is never fetched.
 */
export function wantsActivityLine(thread: PluginSidebarThread): boolean {
  return (
    thread.isUnread ||
    thread.indicator === "unread-success" ||
    thread.indicator === "unread-error" ||
    isWorking(thread) ||
    isActivityIndicator(thread.indicator)
  );
}

/**
 * What each chat is doing or last said, one line per thread id. A thread is
 * re-read when its update time moves, and every few seconds while it works.
 */
export function useThreadActivity(threads: readonly PluginSidebarThread[]): ReadonlyMap<string, string> {
  const rpc = useRpc<typeof cursorSidebarRpcContract>();
  const [lines, setLines] = useState<ReadonlyMap<string, string>>(new Map());
  const seen = useRef(new Map<string, string>());
  // Answers land even if the thread list moved on meanwhile; only an unmounted
  // sidebar drops them, since `seen` already counts those threads as loaded.
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const versionKey = threads.map((thread) => `${thread.id}@${thread.updatedAt}`).join("\0");
  const workingKey = threads
    .filter((thread) => isWorking(thread) || isActivityIndicator(thread.indicator))
    .map((thread) => thread.id)
    .join("\0");

  useEffect(() => {
    const load = async (ids: readonly string[]) => {
      for (let index = 0; index < ids.length; index += 100) {
        const result = await rpc.call("listActivity", { threadIds: ids.slice(index, index + 100) });
        if (!mounted.current) return;
        setLines((current) => {
          const next = new Map(current);
          for (const { threadId, text } of result.threads) {
            if (text === null) next.delete(threadId);
            else next.set(threadId, text);
          }
          return next;
        });
      }
    };
    const changed = threads.filter((thread) => seen.current.get(thread.id) !== String(thread.updatedAt));
    for (const thread of changed) seen.current.set(thread.id, String(thread.updatedAt));
    if (changed.length > 0) void load(changed.map((thread) => thread.id)).catch(() => {});

    const working = workingKey ? workingKey.split("\0") : [];
    const timer =
      working.length > 0
        ? window.setInterval(() => void load(working).catch(() => {}), WORKING_REFRESH_MS)
        : null;
    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
    // versionKey and workingKey stand in for `threads`, which changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, versionKey, workingKey]);

  return lines;
}
