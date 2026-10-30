import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { Panel } from "./src/ui/Panel";

// One fixed tab in every chat's side panel: the diffs of the chat's PR stack.
export default definePluginApp((app) => {
  app.slots.experimental_tab({
    id: "pr-diffs",
    title: "PR Diffs",
    icon: "GitPullRequest",
    context: { kind: "thread" },
    availability: "fixed",
    layout: "flush",
    component: Panel,
  });
});
