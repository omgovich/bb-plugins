/** Storage key of one file's Viewed mark: per PR (or branch), per source. */
export function viewedKey(repo: string, pr: number | string, source: "github" | "local", path: string): string {
  return `${repo}#${pr}:${source}:${path}`;
}

/** Stored for a test file the reviewer un-viewed, since tests count as viewed by default. */
export const UNVIEWED = "!unviewed";

/**
 * A mark holds only while the file's edits are the ones that were viewed.
 * Test files count as viewed until the reviewer unticks them.
 */
export function isViewed(stored: string | undefined, fingerprint: string, test = false): boolean {
  return test ? stored !== UNVIEWED : stored === fingerprint;
}

const STORAGE_KEY = "bb-plugin-pr-stack-diff:viewed:v1";

export function loadViewed(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveViewed(marks: Record<string, string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Storage is a convenience; the in-memory marks still drive this session.
  }
}
