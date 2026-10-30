export interface DiffRow {
  kind: "hunk" | "ctx" | "add" | "del";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

/** One file's unified patch as numbered rows, the file header dropped. */
export function parseRows(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      rows.push({ kind: "hunk", oldNo: null, newNo: null, text: line });
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) rows.push({ kind: "add", oldNo: null, newNo: newNo++, text: line.slice(1) });
    else if (line.startsWith("-")) rows.push({ kind: "del", oldNo: oldNo++, newNo: null, text: line.slice(1) });
    else if (line.startsWith(" ")) rows.push({ kind: "ctx", oldNo: oldNo++, newNo: newNo++, text: line.slice(1) });
  }
  return rows;
}
