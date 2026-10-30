// The review form is a nav panel, so "Review PR" sits in the sidebar
// navigation under New thread.
import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { definePluginApp, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

function ReviewPage() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [url, setUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = url.trim() !== "" && !pending;

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const { threadId } = await rpc.call("review_start", {
        url: url.trim(),
        instructions: instructions.trim(),
      });
      setUrl("");
      setInstructions("");
      navigate.toThread(threadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  // Mod+Enter submits from the multi-line instructions field.
  const submitOnModEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-xl px-4 pt-10 md:px-5">
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-3 p-5 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Icon name="GitPullRequest" className="size-4" />
              Review a pull request
            </div>
            <p className="text-xs text-muted-foreground">
              Checks the PR out into a new worktree and starts a review agent
              there. The prompt and agent are in the plugin's settings.
            </p>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              aria-label="Pull request URL"
              autoFocus
              disabled={pending}
              aria-invalid={error !== null}
            />
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              onKeyDown={submitOnModEnter}
              placeholder="Anything extra for this review? Optional"
              aria-label="Extra instructions"
              rows={3}
              disabled={pending}
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            {error === null ? null : (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!canSubmit}>
                <Icon name={pending ? "Loader" : "Play"} className="size-4" />
                {pending ? "Starting…" : "Start review"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "review-pr",
    title: "Review PR",
    icon: "GitPullRequest",
    path: "review",
    component: ReviewPage,
  });
});
