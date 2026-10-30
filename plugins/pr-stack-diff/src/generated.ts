// Files a reviewer rarely reads line by line: lockfiles, snapshots, build
// output and files that say they are generated. They start folded.
const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
  "Cargo.lock", "Gemfile.lock", "poetry.lock", "uv.lock", "Pipfile.lock", "composer.lock",
  "go.sum", "Podfile.lock", "pubspec.lock", "flake.lock", "mix.lock",
]);
const GENERATED_DIRS = /(^|\/)(dist|build|out|vendor|__generated__|generated|\.next|coverage)\//;
const GENERATED_NAMES = /(\.min\.(js|css)|\.map|\.snap|\.pb\.go|_pb2\.py|\.g\.dart|\.generated\.[a-z]+|\.gen\.[a-z]+)$/;

export function isGeneratedPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return LOCKFILES.has(name) || GENERATED_DIRS.test(path) || GENERATED_NAMES.test(name);
}

// Test code: reviewed on trust by default, like a GitHub "mark tests viewed" pass.
const TEST_DIRS = /(^|\/)(__tests__|__mocks__|__fixtures__|tests?|testing|[^/]*Testing|e2e|specs?)\//;
const TEST_NAMES = /(\.(test|spec|e2e|e2e-spec)\.[a-z0-9]+|_test\.(go|py|rb|exs?)|^test_[^/]*\.py|^(test-?utils|test-?helpers|setup-?tests)\.[a-z]+)$/i;

export function isTestPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return TEST_DIRS.test(path) || TEST_NAMES.test(name);
}
