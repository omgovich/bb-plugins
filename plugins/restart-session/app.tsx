import { useState } from "react";
import { definePluginApp, useSdk } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

const BUSY_STATUSES = new Set(["active", "starting", "pending"]);

function RestartIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : undefined}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function RestartButton({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  const [restarting, setRestarting] = useState(false);

  async function restart(): Promise<void> {
    if (restarting) return;
    setRestarting(true);
    try {
      const thread = await sdk.threads.get({ threadId });
      if (
        BUSY_STATUSES.has(thread.status) &&
        !window.confirm("The agent is working. Reconnecting stops the current turn. Reconnect anyway?")
      ) {
        return;
      }
      await sdk.threads.stop({ threadId });
      toast.success("Session released. The next message starts a fresh agent with reconnected MCP servers.");
    } catch (error) {
      toast.error(`Reconnect failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRestarting(false);
    }
  }

  return (
    <button
      type="button"
      title="Reconnect the agent: keeps the history, reconnects MCP servers on the next message"
      aria-label="Reconnect the agent"
      disabled={restarting}
      onClick={() => void restart()}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
    >
      <RestartIcon spinning={restarting} />
      Reconnect
    </button>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "restart-session",
    title: "Reconnect agent",
    component: RestartButton,
  });
});
