import { createHash } from "node:crypto";

export interface FileDiff {
  path: string;
  /** The previous path of a renamed file, else null. */
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  additions: number;
  deletions: number;
  /** This file's slice of the unified diff, header included. */
  patch: string;
}

/** Split a multi-file `git diff` / `gh pr diff` output into one entry per file. */
export function splitPatch(unified: string): FileDiff[] {
  const chunks = unified.split(/^(?=diff --git )/m).filter((chunk) => chunk.startsWith("diff --git "));
  return chunks.map(parseFile);
}

function parseFile(patch: string): FileDiff {
  const lines = patch.split("\n");
  const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(lines[0] ?? "");
  let path = header?.[2] ?? "";
  let oldPath: string | null = null;
  let status: FileDiff["status"] = "modified";
  let binary = false;
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of lines.slice(1)) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (inHunk) {
      if (line.startsWith("+")) additions += 1;
      else if (line.startsWith("-")) deletions += 1;
      continue;
    }
    if (line.startsWith("new file mode")) status = "added";
    else if (line.startsWith("deleted file mode")) status = "deleted";
    else if (line.startsWith("rename from ")) {
      oldPath = line.slice("rename from ".length);
      status = "renamed";
    } else if (line.startsWith("rename to ")) path = line.slice("rename to ".length);
    else if (line.startsWith("Binary files ") || line === "GIT binary patch") binary = true;
  }
  return { path, oldPath, status, binary, additions, deletions, patch };
}

/**
 * A fingerprint of what a file's diff changes, blind to where: only the added
 * and removed lines count, so a rebase that shifts line numbers or context
 * keeps the same fingerprint.
 */
export function editFingerprint(patch: string): string {
  const hash = createHash("sha1");
  const header: string[] = [];
  let inHunk = false;
  let edits = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (inHunk && (line.startsWith("+") || line.startsWith("-"))) {
      hash.update(`${line}\n`);
      edits += 1;
    } else if (!inHunk && /^(index |old mode|new mode|new file mode|deleted file mode|rename (from|to) )/.test(line)) {
      header.push(line);
    }
  }
  // A binary, rename-only or mode-only change has no edited lines: its blob
  // ids and modes are what changes, so they stand in for the edits.
  if (edits === 0) hash.update(header.join("\n"));
  return hash.digest("hex");
}
