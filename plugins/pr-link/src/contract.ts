// The PR Link RPC contract. Other plugins (cursor-sidebar, PR Diffs) keep a
// verbatim copy of this file to call it with `pluginId: "pr-link"`; change
// them together.
import type { defineRpcContract as DefineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

// The SDK's defineRpcContract only returns its argument. A local copy keeps
// the SDK's root entry, which bb does not provide to app bundles, out of the
// app: this file is imported by both sides.
const defineRpcContract: typeof DefineRpcContract = (contract) => contract;

export const PR_LINK_PLUGIN_ID = "pr-link";

export const linkedPrSchema = z.object({
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["open", "draft", "merged", "closed"]),
  headRefName: z.string(),
  baseRefName: z.string(),
  approved: z.boolean(),
});
export type LinkedPr = z.infer<typeof linkedPrSchema>;

export const threadPrSchema = z.object({
  /** "attached": set by hand or by a plugin; "auto": the branch's PR; "none": neither. */
  mode: z.enum(["auto", "attached", "none"]),
  pr: linkedPrSchema.nullable(),
  /** Why `pr` is null although a PR was expected (gh failed, PR not found). */
  error: z.string().nullable(),
});
export type ThreadPr = z.infer<typeof threadPrSchema>;

export const threadTag = (threadId: string) => `thread:${threadId}`;

export const prLinkRpcContract = defineRpcContract({
  /** Each chat's pull request, keyed by thread id. */
  pullRequests: {
    input: z.object({ keys: z.array(z.string().min(1)).min(1).max(200) }).strict(),
    output: z.record(z.string(), threadPrSchema),
    keyTags: (threadId: string) => [threadTag(threadId)],
  },
  /** Make `pr` (URL, owner/repo#n, #n or n) the chat's pull request. */
  attach: {
    input: z.object({ threadId: z.string().min(1), pr: z.string().trim().min(1) }).strict(),
    output: z.object({ ok: z.literal(true) }),
    invalidates: ({ threadId }: { threadId: string }) => [threadTag(threadId)],
  },
  /** Go back to the PR of the chat's current branch. */
  detach: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({ ok: z.literal(true) }),
    invalidates: ({ threadId }: { threadId: string }) => [threadTag(threadId)],
  },
});
