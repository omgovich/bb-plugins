// Host Battery — the charge of the machine that runs bb, for people who watch
// their agents from a phone.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { parsePmset } from "./battery";
import { hostBatteryRpcContract } from "./contract";

const execFileAsync = promisify(execFile);

export default async function plugin(bb: BbPluginApi) {
  bb.rpc.register(hostBatteryRpcContract, {
    battery: async () => {
      if (process.platform !== "darwin") return null;
      try {
        const { stdout } = await execFileAsync("/usr/bin/pmset", ["-g", "batt"], { timeout: 5_000 });
        return parsePmset(stdout);
      } catch (error) {
        bb.log.warn(`pmset failed: ${String(error)}`);
        return null;
      }
    },
  });
}
