/** A GitHub pull request named by a link. */
export interface PrRef {
  repo: string;
  number: number;
}

const PULL_URL = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)(?:[/?#]|$)/i;

/** The pull request a link points at (its files, commits or a comment included), or null. */
export function parsePullUrl(href: string): PrRef | null {
  const match = PULL_URL.exec(href.trim());
  if (!match) return null;
  return { repo: `${match[1]}/${match[2]}`.toLowerCase(), number: Number(match[3]) };
}

/** The cache and RPC key of a pull request: `owner/repo#123`. */
export function prKey(ref: PrRef): string {
  return `${ref.repo}#${ref.number}`;
}

export function parsePrKey(key: string): PrRef | null {
  const match = /^([a-z0-9-]+\/[a-z0-9._-]+)#(\d+)$/.exec(key);
  return match ? { repo: match[1]!, number: Number(match[2]) } : null;
}
