import type { BbPluginApi } from "@get-bb/plugin-sdk";

// The restart button lives entirely in app.tsx; bb requires a server entry.
export default async function plugin(_bb: BbPluginApi) {}
