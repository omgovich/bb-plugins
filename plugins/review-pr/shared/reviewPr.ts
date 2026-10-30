/** The bundled skill a review follows unless the Prompt setting names another. */
export const DEFAULT_REVIEW_SKILL = "review-pull-request";

/** What a review thread is told; `{url}` becomes the PR's URL. */
export const DEFAULT_REVIEW_PROMPT = `Review the pull request {url} following the \`${DEFAULT_REVIEW_SKILL}\` skill.`;

/** Review threads land in this sidebar section unless the Section setting says otherwise. */
export const DEFAULT_REVIEW_SECTION = "Reviews";

/** The review thread's first message: the prompt with the PR's URL, then any extra instructions. */
export function buildReviewPrompt(template: string, url: string, instructions: string): string {
  const base = (template.trim() || DEFAULT_REVIEW_PROMPT).replaceAll("{url}", url);
  const prompt = base.includes(url) ? base : `${base} ${url}`;
  const extra = instructions.trim();
  return extra ? `${prompt}\n\n${extra}` : prompt;
}

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

const PULL_REQUEST_URL_PATTERN = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i;

export function parsePullRequestUrl(text: string): PullRequestRef | null {
  const match = PULL_REQUEST_URL_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, owner, repo, number] = match;
  return {
    owner,
    repo,
    number: Number(number),
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

const GITHUB_REMOTE_PATTERN = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

/** `owner/repo` in lower case for a GitHub remote URL, or null for any other remote. */
export function githubRepositoryOf(remoteUrl: string): string | null {
  const match = GITHUB_REMOTE_PATTERN.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}
