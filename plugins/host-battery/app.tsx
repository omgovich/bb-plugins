// The charge of the Mac that runs bb, in the thread header on phones: from a
// phone you cannot see that machine's menu bar, and its agents stop when its
// battery does.
import { useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";
import { hostBatteryRpcContract, type batterySchema } from "./src/contract";

type Battery = z.infer<typeof batterySchema>;

const POLL_MS = 60_000;
/** Phones only: on a computer the menu bar already shows the battery. */
const PHONE_QUERY = "(max-width: 639px)";
const LOW_PERCENT = 20;
const CRITICAL_PERCENT = 10;

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return phone;
}

function useBattery(enabled: boolean): Battery | null {
  const rpc = useRpc<typeof hostBatteryRpcContract>();
  const [battery, setBattery] = useState<Battery | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      rpc.call("battery", {}).then(
        (next) => {
          if (!cancelled) setBattery(next);
        },
        () => undefined,
      );
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, rpc]);
  return battery;
}

function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function describe(battery: Battery): string {
  const left = battery.minutesLeft !== null && battery.minutesLeft > 0 ? battery.minutesLeft : null;
  const parts = [`bb's Mac: ${battery.percent}%`];
  if (battery.state === "charging") parts.push(left ? `charging, full in ${formatMinutes(left)}` : "charging");
  else if (battery.state === "charged") parts.push("charged");
  else if (battery.state === "not-charging") parts.push("on power, not charging");
  else parts.push(left ? `on battery, ${formatMinutes(left)} left` : "on battery");
  return parts.join(" · ");
}

/** A battery outline whose fill follows the charge, with a bolt while on power. */
function BatteryGlyph({ battery, color }: { battery: Battery; color: string }) {
  const fill = Math.max(1, Math.round((Math.min(100, battery.percent) / 100) * 14));
  return (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="17" height="11" rx="2.5" stroke="currentColor" opacity="0.5" />
      <rect x="18.25" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.5" />
      <rect x="2" y="2" width={fill} height="8" rx="1.25" fill={color} />
      {battery.onPower ? (
        <path d="M10 1.5 6.5 6.75h2.75L8 10.5l3.75-5.25H9l1-3.75Z" fill="currentColor" stroke="var(--background, #fff)" strokeWidth="0.75" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

function HostBattery() {
  const phone = usePhone();
  const battery = useBattery(phone);
  if (!phone || battery === null) return null;
  const draining = !battery.onPower;
  const color =
    draining && battery.percent <= CRITICAL_PERCENT
      ? "var(--destructive, #dc2626)"
      : draining && battery.percent <= LOW_PERCENT
        ? "var(--warning, #d97706)"
        : battery.onPower
          ? "var(--success, #16a34a)"
          : "currentColor";
  const label = describe(battery);
  // Inline styles: the chip must not depend on the plugin's stylesheet.
  return (
    <span
      role="status"
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 28,
        padding: "0 6px",
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
        color: draining && battery.percent <= CRITICAL_PERCENT ? color : "var(--muted-foreground, currentColor)",
      }}
    >
      <BatteryGlyph battery={battery} color={color} />
      {battery.percent}%
    </span>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "host-battery",
    title: "Battery of bb's Mac",
    component: HostBattery,
  });
});
