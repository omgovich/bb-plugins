import type { defineRpcContract as DefineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

// The SDK's defineRpcContract only returns its argument; a local copy keeps the
// SDK's root entry, which bb does not provide to app bundles, out of the app.
const defineRpcContract: typeof DefineRpcContract = (contract) => contract;

export const prPeekSchema = z.object({
  title: z.string(),
  state: z.enum(["open", "draft", "merged", "closed"]),
  author: z.string().nullable(),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
});
export type PrPeek = z.infer<typeof prPeekSchema>;

export const peekResultSchema = z.object({
  pr: prPeekSchema.nullable(),
  /** Why `pr` is null: gh missing or logged out, no access, no such PR. */
  error: z.string().nullable(),
});
export type PeekResult = z.infer<typeof peekResultSchema>;

export const prPeekRpcContract = defineRpcContract({
  /** Pull requests by `owner/repo#123`. */
  pullRequests: {
    input: z.object({ keys: z.array(z.string().min(1)).min(1).max(50) }).strict(),
    output: z.record(z.string(), peekResultSchema),
    keyTags: (key: string) => [`pr:${key}`],
  },
});
