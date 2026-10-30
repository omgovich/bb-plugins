// Client copy of the PR Link plugin's RPC contract
// (~/bb-plugins/bb-plugin-pr-link/src/contract.ts). Only what a reader needs:
// method names, schemas and key tags.
import type { defineRpcContract as DefineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

// The SDK's defineRpcContract only returns its argument. A local copy keeps
// the SDK's root entry, which bb does not provide to app bundles, out of the
// app: this file is imported by both sides.
const defineRpcContract: typeof DefineRpcContract = (contract) => contract;

export const PR_LINK_PLUGIN_ID = "pr-link";

const linkedPrSchema = z.object({
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["open", "draft", "merged", "closed"]),
  headRefName: z.string(),
  baseRefName: z.string(),
  approved: z.boolean(),
});

const threadPrSchema = z.object({
  mode: z.enum(["auto", "attached", "none"]),
  pr: linkedPrSchema.nullable(),
  error: z.string().nullable(),
});
export type ThreadPr = z.infer<typeof threadPrSchema>;

// The key tags must match the server's: BB maps an invalidated tag back to
// the cached keys through them. This plugin's pinned SDK predates keyTags,
// hence the cast.
export const prLinkRpcContract = defineRpcContract({
  pullRequests: {
    input: z.object({ keys: z.array(z.string().min(1)).min(1).max(200) }).strict(),
    output: z.record(z.string(), threadPrSchema),
    keyTags: (threadId: string) => [`thread:${threadId}`],
  } as { input: z.ZodType<{ keys: string[] }>; output: z.ZodType<Record<string, ThreadPr>> },
  attach: {
    input: z.object({ threadId: z.string().min(1), pr: z.string().trim().min(1) }).strict(),
    output: z.object({ ok: z.literal(true) }),
    invalidates: ({ threadId }: { threadId: string }) => [`thread:${threadId}`],
  } as { input: z.ZodType<{ threadId: string; pr: string }>; output: z.ZodType<{ ok: true }> },
  detach: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({ ok: z.literal(true) }),
    invalidates: ({ threadId }: { threadId: string }) => [`thread:${threadId}`],
  } as { input: z.ZodType<{ threadId: string }>; output: z.ZodType<{ ok: true }> },
});
