/**
 * One plain line saying what a chat is up to, read straight off its timeline
 * with no model: the first sentence of the agent's newest message. While it
 * works that is the note it wrote before its current commands; once it stops,
 * the opening of its answer. Commands and file reads are never shown.
 */

/** The few timeline row fields this reads; everything else is ignored. */
export interface ActivityRow {
  kind?: string;
  role?: string;
  text?: string | null;
}

const MAX_LENGTH = 120;

export function describeActivity(rows: readonly ActivityRow[]): string | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.kind !== "conversation") continue;
    // The user spoke last: the agent has not said anything since.
    if (row.role === "user") return null;
    if (row.role === "assistant") {
      const sentence = firstSentence(row.text ?? "");
      if (sentence !== null) return sentence;
    }
  }
  return null;
}

/** The first sentence of a Markdown reply, as plain text. */
function firstSentence(markdown: string): string | null {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .split("\n")
    // A heading names the reply rather than saying anything; skip it.
    .filter((line) => !/^\s*#{1,6}\s/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+|>\s*|\|)/, "").trim())
    .find((line) => line !== "" && !/^[-|:\s]+$/.test(line));
  if (plain === undefined) return null;
  const sentence = plain.match(/^.+?[.!?…](?=\s|$)/)?.[0] ?? plain;
  return clip(sentence.replace(/:$/, ""), MAX_LENGTH);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
