/** What `pmset -g batt` says about the Mac's internal battery. */
export interface BatteryState {
  percent: number;
  /** charging, discharging, full (on power, done), or on power but not charging. */
  state: "charging" | "discharging" | "charged" | "not-charging";
  /** On mains power, not the battery. */
  onPower: boolean;
  /** Minutes to empty while discharging or to full while charging, when macOS knows. */
  minutesLeft: number | null;
}

/**
 * Parses `pmset -g batt`, e.g.
 *   Now drawing from 'Battery Power'
 *    -InternalBattery-0 (id=21561443)	3%; discharging; 2:29 remaining present: true
 * Null when the machine has no battery (a desktop Mac, or not macOS).
 */
export function parsePmset(output: string): BatteryState | null {
  const line = output.split("\n").find((l) => /InternalBattery/.test(l));
  if (!line) return null;
  const percent = /(\d+)%/.exec(line);
  if (!percent) return null;
  const raw = /%;\s*([^;]+);/.exec(line)?.[1]?.trim().toLowerCase() ?? "";
  const onPower = /'AC Power'/.test(output);
  const state: BatteryState["state"] =
    raw === "charging" ? "charging" : raw === "discharging" ? "discharging" : raw === "charged" ? "charged" : onPower ? "not-charging" : "discharging";
  const time = /(\d+):(\d{2}) remaining/.exec(line);
  const minutesLeft = time ? Number(time[1]) * 60 + Number(time[2]) : null;
  return { percent: Number(percent[1]), state, onPower, minutesLeft };
}
