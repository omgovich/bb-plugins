// Usage Bars — weekly provider limits as progress bars pinned above the
// sidebar footer.
//
// BB has no slot for always-visible sidebar content, so an app overlay finds
// the sidebar body in the DOM and portals the bars into its bottom edge, just
// above the footer. The footer itself has a fixed height in the desktop app.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  definePluginApp,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import { z } from "zod";

const POLL_MS = 5 * 60_000;
const SIDEBAR_BODY_SELECTOR = '[data-testid="app-sidebar-body"]';

interface UsageWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
  kind?: string;
  model?: string | null;
}

interface ProviderBar {
  key: string;
  providerId: string;
  /** Account label, set for Account Pooler accounts. */
  account?: string;
  window?: UsageWindow;
  fiveHour?: UsageWindow;
}

// Account Pooler publishes per-account usage through provider-usage.v1.
const POOL_PLUGIN_ID = "account-pool";

const windowSchema = z.object({
  kind: z.string().optional(),
  label: z.string(),
  usedPercent: z.number(),
  resetsAt: z.string().nullable(),
  model: z.string().nullable().optional(),
});

const poolResourcesSchema = z.object({
  resources: z.array(z.object({
    id: z.string(),
    providerId: z.string(),
    label: z.string(),
  })),
});

const poolUsageSchema = z.object({
  usage: z.object({
    status: z.string(),
    windows: z.array(windowSchema).optional(),
  }),
});

type ProviderInfo = ReturnType<
  typeof experimental_useProviders
>["providers"][number];

type UsageResponse = Awaited<
  ReturnType<ReturnType<typeof useSdk>["system"]["usageLimits"]>
>;

/** The provider-wide weekly window, ignoring per-model weekly windows. */
function pickWeekly(windows: readonly UsageWindow[]): UsageWindow | undefined {
  return (
    windows.find((w) => w.kind === "weekly" && !w.model) ??
    windows.find((w) => /^weekly/i.test(w.label) && !w.model)
  );
}

function toBar(
  key: string,
  providerId: string,
  windows: readonly UsageWindow[],
  account?: string,
): ProviderBar | null {
  const weekly = pickWeekly(windows);
  const fiveHour = providerId === "claude-code"
    ? windows.find((w) => w.kind === "five-hour" && !w.model)
    : undefined;
  return weekly || fiveHour
    ? { key, providerId, account, window: weekly, fiveHour }
    : null;
}

function toBars(response: UsageResponse): ProviderBar[] {
  const bars: ProviderBar[] = [];
  for (const [providerId, usage] of Object.entries(response)) {
    if (usage.status !== "ok") continue;
    const bar = toBar(providerId, providerId, usage.windows as UsageWindow[]);
    if (bar) bars.push(bar);
  }
  return bars;
}

type Sdk = ReturnType<typeof useSdk>;

/**
 * One bar per Account Pooler account, or null when the pool is off or has no
 * accounts. Cached measurements only; the pool refreshes quota on its own.
 */
async function loadPoolBars(
  sdk: Sdk,
  signal?: AbortSignal,
): Promise<ProviderBar[] | null> {
  const { resources } = await sdk.plugins.callRpc({
    pluginId: POOL_PLUGIN_ID,
    method: "provider-usage.v1.listResources",
    input: {},
    outputSchema: poolResourcesSchema,
    signal,
  });
  if (resources.length === 0) return null;
  const bars = await Promise.all(resources.map(async (resource) => {
    const { usage } = await sdk.plugins.callRpc({
      pluginId: POOL_PLUGIN_ID,
      method: "provider-usage.v1.getResource",
      input: { resourceId: resource.id, refresh: false },
      outputSchema: poolUsageSchema,
      signal,
    }).catch(() => ({ usage: { status: "error", windows: undefined } }));
    if (usage.status !== "ok" || !usage.windows) return null;
    return toBar(resource.id, resource.providerId, usage.windows, resource.label);
  }));
  return bars.filter((bar): bar is ProviderBar => bar !== null);
}

async function loadBars(sdk: Sdk, signal?: AbortSignal): Promise<ProviderBar[]> {
  const [local, pool] = await Promise.all([
    sdk.system.usageLimits({ signal }).then(toBars),
    // A missing or disabled pool falls back to the local login's limits.
    loadPoolBars(sdk, signal).catch(() => null),
  ]);
  if (pool === null) return local;
  // The pool replaces the local login for the providers it serves.
  const pooled = new Set(pool.map((bar) => bar.providerId));
  return [...local.filter((bar) => !pooled.has(bar.providerId)), ...pool];
}

function useWeeklyUsage(): ProviderBar[] | null {
  const sdk = useSdk();
  const [bars, setBars] = useState<ProviderBar[] | null>(null);
  const load = useCallback(
    (signal?: AbortSignal) => {
      loadBars(sdk, signal).then(
        (next) => { if (!signal?.aborted) setBars(next); },
        // Keep the last bars on a failed refresh; the next poll retries.
        () => undefined,
      );
    },
    [sdk],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = window.setInterval(() => load(controller.signal), POLL_MS);
    const onFocus = () => load(controller.signal);
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);
  return bars;
}

/** A container kept as the last child of the sidebar body across re-renders. */
function useSidebarMount(): HTMLElement | null {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const container = document.createElement("div");
    container.dataset.usageBars = "";
    // Scopes the plugin's compiled Tailwind classes to this subtree.
    container.dataset.bbPlugin = "usage-bars";
    // The sidebar body is a flex column; never let the thread list squeeze us.
    container.style.flexShrink = "0";
    const place = () => {
      const body = document.querySelector(SIDEBAR_BODY_SELECTOR);
      if (!body) {
        container.remove();
        setMount(null);
        return;
      }
      if (body.lastElementChild !== container) {
        body.appendChild(container);
      }
      setMount(container);
    };
    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      container.remove();
    };
  }, []);
  return mount;
}

function formatReset(resetsAt: string | null): string | null {
  if (resetsAt === null) return null;
  const ms = Date.parse(resetsAt) - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "now";
  // Round once, then split, so 23.6h of remainder can't print as "24h".
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

// Bar colours are inline, not Tailwind classes: the labels share classes with
// bb's own stylesheet, but these would vanish with the plugin's, leaving labels
// over empty space.
function barColor(left: number): string {
  if (left <= 5) return "color-mix(in oklab, var(--destructive) 70%, transparent)";
  if (left <= 20) return "color-mix(in oklab, var(--warning) 70%, transparent)";
  return "color-mix(in oklab, var(--sidebar-foreground) 30%, transparent)";
}
const TRACK_COLOR = "color-mix(in oklab, var(--sidebar-foreground) 6%, transparent)";

function remaining(window: UsageWindow): number {
  return 100 - Math.min(100, Math.max(0, Math.round(window.usedPercent)));
}

function limitTitle(name: string, label: string, window: UsageWindow): string {
  const reset = formatReset(window.resetsAt);
  return `${name} · ${label} · ${remaining(window)}% left${
    reset ? ` · resets in ${reset}` : ""
  }${window.resetsAt ? ` · ${new Date(window.resetsAt).toLocaleString()}` : ""}`;
}

function LimitTrack({ window, name, label }: {
  window: UsageWindow;
  name: string;
  label: string;
}) {
  const left = remaining(window);
  return (
    <div
      role="progressbar"
      aria-label={`${name} ${label} limit left`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={left}
      title={limitTitle(name, label, window)}
      className="min-h-0 flex-1 overflow-hidden"
      style={{ backgroundColor: TRACK_COLOR }}
    >
      <div
        className="h-full transition-[width]"
        style={{ width: `${left}%`, backgroundColor: barColor(left) }}
      />
    </div>
  );
}

function UsageBar({ bar, provider, pad }: {
  bar: ProviderBar;
  provider: ProviderInfo | undefined;
  /** Keep an empty cell for a missing window so the bar stays half-width. */
  pad: boolean;
}) {
  const providerName = provider?.displayName ?? bar.providerId;
  const name = bar.account ? `${providerName} (${bar.account})` : providerName;
  const limits = [
    { label: "7d", window: bar.window },
    { label: "5h", window: bar.fiveHour },
  ];
  return (
    <>
      {limits.map(({ label, window }) => window ? (
        <div
          key={label}
          className="flex min-w-0 flex-1 basis-0 flex-col gap-1"
          title={limitTitle(name, label, window)}
        >
          <div className="flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-sidebar-foreground">
            <ProviderIcon
              providerKind="agent"
              provider={provider ?? { id: bar.providerId }}
              className="size-3 shrink-0"
              aria-label={name}
            />
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="shrink-0 tabular-nums">{remaining(window)}%</span>
            {formatReset(window.resetsAt) ? (
              <span className="ml-auto min-w-0 truncate tabular-nums text-muted-foreground">
                {formatReset(window.resetsAt)}
              </span>
            ) : null}
          </div>
          <div className="flex overflow-hidden" style={{ height: 6, borderRadius: 9999 }}>
            <LimitTrack window={window} name={name} label={label} />
          </div>
        </div>
      ) : pad ? (
        // Keeps weekly bars aligned in the left column across rows.
        <div key={label} className="min-w-0 flex-1 basis-0" />
      ) : null)}
    </>
  );
}

function UsageBarsOverlay() {
  const mount = useSidebarMount();
  const bars = useWeeklyUsage();
  const { providers } = experimental_useProviders();
  if (mount === null || bars === null || bars.length === 0) return null;
  const renderBar = (bar: ProviderBar, pad: boolean) => (
    <UsageBar
      key={bar.key}
      bar={bar}
      provider={providers.find((p) => p.id === bar.providerId)}
      pad={pad}
    />
  );
  // Local-login bars share one row; each pooled account gets its own row.
  const shared = bars.filter((bar) => !bar.account);
  const accounts = bars.filter((bar) => bar.account);
  return createPortal(
    <div className="flex flex-col gap-1.5 px-3 pb-2 pt-2">
      {shared.length > 0 ? (
        <div className="flex gap-2">
          {shared.map((bar) => renderBar(bar, shared.length === 1))}
        </div>
      ) : null}
      {accounts.map((bar) => (
        <div key={bar.key} className="flex gap-2">{renderBar(bar, true)}</div>
      ))}
    </div>,
    mount,
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "usage-bars",
    component: UsageBarsOverlay,
  });
});
