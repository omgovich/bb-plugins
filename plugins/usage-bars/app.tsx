// Usage Bars — weekly provider limits as progress bars pinned above the
// sidebar footer.
//
// BB has no slot for always-visible sidebar content, so an app overlay finds
// the sidebar body in the DOM and portals the bars into its bottom edge, just
// above the footer. The footer itself has a fixed height in the desktop app.
import { useEffect, useState } from "react";
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
  limits: Limit[];
}

interface Limit {
  key: string;
  /** Short text beside the icon. */
  label: string;
  /** A model-scoped limit's model, shown before the label. */
  model?: string;
  window: UsageWindow;
  /** Set when the latest reading lacked this limit: when it was last seen. */
  seenAt?: number;
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

/** Claude's weekly window scoped to Fable, when the plan has one. */
function pickFableWeekly(
  windows: readonly UsageWindow[],
): UsageWindow | undefined {
  return windows.find((w) =>
    w.kind === "weekly" && !!w.model && /fable/i.test(`${w.model} ${w.label}`)
  );
}

function toBar(
  key: string,
  providerId: string,
  windows: readonly UsageWindow[],
  account?: string,
): ProviderBar | null {
  const isClaude = providerId === "claude-code";
  const weekly = pickWeekly(windows);
  const fiveHour = isClaude
    ? windows.find((w) => w.kind === "five-hour" && !w.model)
    : undefined;
  const fable = isClaude ? pickFableWeekly(windows) : undefined;
  const limits: Limit[] = [];
  if (weekly) limits.push({ key: "7d", label: "7d", window: weekly });
  if (fiveHour) limits.push({ key: "5h", label: "5h", window: fiveHour });
  if (fable) {
    limits.push({ key: "fable", label: "7d", model: "Fable", window: fable });
  }
  return limits.length > 0 ? { key, providerId, account, limits } : null;
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

// The scoped limits come from an experimental Claude Code API, and a reading
// sometimes arrives without them. A model limit that was there a moment ago
// has not gone away, so keep the last one seen until it resets.
const REMEMBER_KEY = "usage-bars:model-limits";
const REMEMBER_MS = 6 * 60 * 60_000;

const rememberedSchema = z.record(
  z.string(),
  z.object({
    seenAt: z.number(),
    limit: z.object({
      key: z.string(),
      label: z.string(),
      model: z.string(),
      window: windowSchema,
    }),
  }),
);

function readRemembered(): z.infer<typeof rememberedSchema> {
  try {
    return rememberedSchema.parse(
      JSON.parse(window.localStorage.getItem(REMEMBER_KEY) ?? "{}"),
    );
  } catch {
    return {};
  }
}

function withRememberedLimits(bars: ProviderBar[]): ProviderBar[] {
  const now = Date.now();
  const remembered = readRemembered();
  const next = bars.map((bar) => {
    const scoped = bar.limits.find((limit) => limit.model);
    if (scoped?.model) {
      remembered[bar.key] = {
        limit: { ...scoped, model: scoped.model },
        seenAt: now,
      };
      return bar;
    }
    const kept = remembered[bar.key];
    if (!kept) return bar;
    const reset = kept.limit.window.resetsAt;
    if (
      now - kept.seenAt > REMEMBER_MS ||
      (reset !== null && Date.parse(reset) <= now)
    ) {
      delete remembered[bar.key];
      return bar;
    }
    return {
      ...bar,
      limits: [...bar.limits, { ...kept.limit, seenAt: kept.seenAt }],
    };
  });
  try {
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(remembered));
  } catch {
    // Without storage the limit is only remembered until the next reading.
  }
  return next;
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

// Claude Code serves the same usage reading for a while, so an immediate
// re-read repeats one that lacks the scoped limits. While a bar shows a
// remembered limit, re-read a few times, spaced out.
const MODEL_LIMIT_RETRY_MS = 30_000;
const MODEL_LIMIT_RETRIES = 4;

function hasRememberedLimit(bar: ProviderBar): boolean {
  return bar.limits.some((limit) => limit.seenAt !== undefined);
}

function useWeeklyUsage(): ProviderBar[] | null {
  const sdk = useSdk();
  const [bars, setBars] = useState<ProviderBar[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let retryTimer: number | undefined;
    // `retriesLeft` is how many quick re-reads may follow this one.
    const load = (retriesLeft: number) => {
      window.clearTimeout(retryTimer);
      loadBars(sdk, signal).then(
        (loaded) => {
          if (signal.aborted) return;
          const next = withRememberedLimits(loaded);
          setBars(next);
          if (retriesLeft > 0 && next.some(hasRememberedLimit)) {
            retryTimer = window.setTimeout(
              () => load(retriesLeft - 1),
              MODEL_LIMIT_RETRY_MS,
            );
          }
        },
        // Keep the last bars on a failed refresh; the next poll retries.
        () => undefined,
      );
    };
    const poll = () => load(MODEL_LIMIT_RETRIES);
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [sdk]);
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

/** How much wider a column with a model name is than a plain one. */
const WIDE_GROW = 1.5;

function UsageBar({ bar, provider, offset, padding, compact, wide }: {
  bar: ProviderBar;
  provider: ProviderInfo | undefined;
  /** Column of this bar's first cell in its row. */
  offset: number;
  /** Empty cells after the bar, so columns line up across rows. */
  padding: number;
  /** Narrow cells: drop the reset time, which stays in the tooltip. */
  compact: boolean;
  /** Columns that hold a model-scoped limit in some row. */
  wide: ReadonlySet<number>;
}) {
  const grow = (cell: number) => ({
    flexGrow: wide.has(offset + cell) ? WIDE_GROW : 1,
  });
  const providerName = provider?.displayName ?? bar.providerId;
  const name = bar.account ? `${providerName} (${bar.account})` : providerName;
  return (
    <>
      {bar.limits.map(({ key, label, model, window, seenAt }, cell) => {
        // A remembered limit is dimmed and says how old its reading is.
        const title = (model ? `${model} ${label}` : label) +
          (seenAt === undefined
            ? ""
            : ` · as of ${new Date(seenAt).toLocaleTimeString()}`);
        return (
          <div
            key={key}
            className="flex min-w-0 flex-1 basis-0 flex-col gap-1"
            style={{ ...grow(cell), opacity: seenAt === undefined ? 1 : 0.6 }}
            title={limitTitle(name, title, window)}
          >
            <div className="flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-sidebar-foreground">
              <ProviderIcon
                providerKind="agent"
                provider={provider ?? { id: bar.providerId }}
                className="size-3 shrink-0"
                aria-label={name}
              />
              {model ? (
                <span
                  className="min-w-0 truncate"
                  style={{ color: "var(--primary)", fontWeight: 600 }}
                >
                  {model}
                </span>
              ) : null}
              <span className="shrink-0 text-muted-foreground">{label}</span>
              <span className="shrink-0 tabular-nums">{remaining(window)}%</span>
              {!compact && formatReset(window.resetsAt) ? (
                <span className="ml-auto min-w-0 truncate tabular-nums text-muted-foreground">
                  {formatReset(window.resetsAt)}
                </span>
              ) : null}
            </div>
            <div className="flex overflow-hidden" style={{ height: 6, borderRadius: 9999 }}>
              <LimitTrack window={window} name={name} label={title} />
            </div>
          </div>
        );
      })}
      {Array.from({ length: padding }, (_, i) => (
        <div
          key={`pad-${i}`}
          className="min-w-0 flex-1 basis-0"
          style={grow(bar.limits.length + i)}
        />
      ))}
    </>
  );
}

/** The most cells one row holds before labels stop fitting. */
const MAX_ROW_CELLS = 3;

function UsageBarsOverlay() {
  const mount = useSidebarMount();
  const bars = useWeeklyUsage();
  const { providers } = experimental_useProviders();
  if (mount === null || bars === null || bars.length === 0) return null;
  // Local-login bars share one row while they fit; each pooled account, and
  // each local provider once they no longer fit, gets its own row.
  const local = bars.filter((bar) => !bar.account);
  const localCells = local.reduce((n, bar) => n + bar.limits.length, 0);
  const rows = local.length > 1 && localCells <= MAX_ROW_CELLS
    ? [local, ...bars.filter((bar) => bar.account).map((bar) => [bar])]
    : bars.map((bar) => [bar]);
  const rowLimits = rows.map((row) => row.flatMap((bar) => bar.limits));
  // Every row has the same number of cells, so the columns line up.
  const cells = Math.max(2, ...rowLimits.map((limits) => limits.length));
  const compact = cells >= MAX_ROW_CELLS;
  // A model name needs a wider cell; widen its whole column in every row.
  const wide = new Set<number>();
  for (const limits of rowLimits) {
    limits.forEach((limit, column) => {
      if (limit.model) wide.add(column);
    });
  }
  return createPortal(
    <div className="flex flex-col gap-1.5 px-3 pb-2 pt-2">
      {rows.map((row, r) => {
        let offset = 0;
        return (
          <div key={row.map((bar) => bar.key).join()} className="flex gap-2">
            {row.map((bar, i) => {
              const start = offset;
              offset += bar.limits.length;
              return (
                <UsageBar
                  key={bar.key}
                  bar={bar}
                  provider={providers.find((p) => p.id === bar.providerId)}
                  offset={start}
                  // The row's last bar carries its padding.
                  padding={i === row.length - 1
                    ? cells - rowLimits[r].length
                    : 0}
                  compact={compact}
                  wide={wide}
                />
              );
            })}
          </div>
        );
      })}
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
