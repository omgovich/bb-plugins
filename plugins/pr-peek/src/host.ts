import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Runs gh, trying Homebrew's install paths too: the BB server's PATH may not
 * include them.
 */
export async function gh(args: string[], cwd?: string): Promise<string> {
  let lastError: unknown = null;
  for (const binary of ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"]) {
    try {
      const { stdout } = await execFileAsync(binary, args, { cwd, maxBuffer: MAX_BUFFER, timeout: 60_000 });
      return stdout;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      lastError = error;
    }
  }
  throw new Error(`gh is not installed: ${String(lastError)}`);
}

/** The readable part of a failed git/gh call. */
export function errorText(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr?.trim();
  return stderr || (error instanceof Error ? error.message : String(error));
}
