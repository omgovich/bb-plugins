export interface ReviewNote {
  /** Null for a branch that has no pull request yet. */
  number: number | null;
  headRef: string;
  source: "github" | "local";
  path: string;
  line: number;
  code: string;
  text: string;
}

/** The message a line note becomes in the agent's chat: where, what, why. */
export function formatComment(note: ReviewNote): string {
  const target = note.number === null ? `branch ${note.headRef}` : `PR #${note.number}`;
  const source = note.source === "github" ? "GitHub" : "local";
  return `Review note on ${target} (${source}) · ${note.path}:${note.line}\n> ${note.code}\n\n${note.text}`;
}
