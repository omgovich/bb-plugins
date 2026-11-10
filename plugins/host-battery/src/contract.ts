import type { defineRpcContract as DefineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

// The SDK's defineRpcContract only returns its argument; a local copy keeps the
// SDK's root entry, which bb does not provide to app bundles, out of the app.
const defineRpcContract: typeof DefineRpcContract = (contract) => contract;

export const batterySchema = z.object({
  percent: z.number(),
  state: z.enum(["charging", "discharging", "charged", "not-charging"]),
  onPower: z.boolean(),
  minutesLeft: z.number().nullable(),
});

export const hostBatteryRpcContract = defineRpcContract({
  /** The battery of the machine that runs bb, or null when it has none. */
  battery: {
    input: z.object({}).strict(),
    output: batterySchema.nullable(),
  },
});
