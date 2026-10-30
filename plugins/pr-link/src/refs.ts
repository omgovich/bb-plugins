/** owner/repo from a GitHub remote URL (https or ssh), else null. */
export function githubRepo(remote: string): string | null {
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** A PR given as a URL, `owner/repo#123`, `#123` or `123`. */
export function parsePr(value: string): { repo: string | null; number: number } {
  const url = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(value);
  if (url) return { repo: `${url[1]}/${url[2]}`, number: Number(url[3]) };
  const short = /^(?:([\w.-]+\/[\w.-]+))?#?(\d+)$/.exec(value.trim());
  if (short) return { repo: short[1] ?? null, number: Number(short[2]) };
  throw new Error(`Not a pull request: ${value}`);
}

/** Realtime channel the panel listens on to refetch a chat's stack. */
export function stackChannel(threadId: string): string {
  return `stack:${threadId}`;
}
