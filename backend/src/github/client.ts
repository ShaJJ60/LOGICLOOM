import { config } from "../config.js";
import type { SourceFile } from "../analyzers/types.js";

const GITHUB_API = "https://api.github.com";
const SUPPORTED: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".mjs": "JavaScript", ".cjs": "JavaScript",
};
const EXCLUDED = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next)\//;
const extension = (path: string) => path.slice(path.lastIndexOf(".")).toLowerCase();

async function github<T>(path: string): Promise<T> {
  const request = async (authenticated: boolean): Promise<Response> => {
    try {
      return await fetch(`${GITHUB_API}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Logicloom-Engineering-Intelligence",
          ...(authenticated && config.GITHUB_TOKEN ? { Authorization: `Bearer ${config.GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const message = timedOut
        ? `GitHub API request timed out while fetching ${path}.`
        : "Could not reach the GitHub API. Check your network connection and try again.";
      throw Object.assign(new Error(message), { status: timedOut ? 504 : 502, cause: error });
    }
  };

  let response = await request(Boolean(config.GITHUB_TOKEN));
  let body = await response.clone().json().catch(() => null) as { message?: string } | null;
  const rateLimited = response.status === 429 ||
    (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(body?.message ?? "")));

  // A stale token should not prevent access to public repositories.
  if (config.GITHUB_TOKEN && (response.status === 401 || response.status === 403) && !rateLimited) {
    const anonymousResponse = await request(false);
    if (anonymousResponse.ok) response = anonymousResponse;
    else {
      response = anonymousResponse;
      body = await response.clone().json().catch(() => null) as { message?: string } | null;
    }
  }

  if (!response.ok) {
    const apiMessage = body?.message;
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    let message: string;
    if (response.status === 404) {
      message = "Repository or branch was not found or is not accessible.";
    } else if (rateLimited || response.status === 429 || remaining === "0") {
      const resetTime = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : undefined;
      message = `GitHub API rate limit exceeded.${resetTime ? ` Try again after ${resetTime}.` : " Try again later or configure a server-side GITHUB_TOKEN."}`;
    } else if (response.status === 401 || response.status === 403) {
      message = `GitHub denied access${apiMessage ? `: ${apiMessage}` : ". Check repository visibility and token permissions."}`;
    } else {
      message = `GitHub API returned ${response.status}${apiMessage ? `: ${apiMessage}` : "."}`;
    }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response.json() as Promise<T>;
}

export type GitHubRepository = { id: number; full_name: string; html_url: string; default_branch: string | null; private: boolean };
export type GitHubBranch = { name: string; commit: { sha: string } };
type TreeEntry = { path: string; type: string; size?: number; sha: string };
type TreeResponse = { truncated: boolean; tree: TreeEntry[] };
type BlobResponse = { content: string; encoding: string; size: number };

export function parseGitHubUrl(input: string): { owner: string; name: string; fullName: string } {
  let url: URL;
  try { url = new URL(input); } catch { throw Object.assign(new Error("Enter a valid GitHub repository URL."), { status: 400 }); }
  if (url.hostname !== "github.com" || url.protocol !== "https:") {
    throw Object.assign(new Error("Only https://github.com/{owner}/{repository} URLs are supported."), { status: 400 });
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || !/^[\w.-]+$/.test(segments[0]) || !/^[\w.-]+$/.test(segments[1])) {
    throw Object.assign(new Error("Repository URL must include exactly an owner and repository name."), { status: 400 });
  }
  const name = segments[1].replace(/\.git$/i, "");
  return { owner: segments[0], name, fullName: `${segments[0]}/${name}` };
}

export async function getRepository(fullName: string): Promise<GitHubRepository> {
  return github(`/repos/${fullName}`.split("/").map((part, index) => index > 1 ? encodeURIComponent(part) : part).join("/"));
}

export async function getBranches(fullName: string, defaultBranch?: string | null): Promise<GitHubBranch[]> {
  const branches: GitHubBranch[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await github<GitHubBranch[]>(`/repos/${fullName}/branches?per_page=100&page=${page}`);
    branches.push(...batch);
    if (batch.length < 100) break;
  }
  if (defaultBranch && branches.length > 0 && !branches.some(({ name }) => name === defaultBranch)) {
    branches.push(await github<GitHubBranch>(`/repos/${fullName}/branches/${encodeURIComponent(defaultBranch)}`));
  }
  return defaultBranch
    ? branches.sort((left, right) => Number(right.name === defaultBranch) - Number(left.name === defaultBranch))
    : branches;
}

export async function fetchSourceFiles(
  fullName: string,
  ref: string,
  reportProgress?: (stage: string, progress: number) => Promise<void>,
): Promise<{ sha: string; files: SourceFile[] }> {
  const encodedRef = encodeURIComponent(ref);
  const commit = await github<{ sha: string }>(`/repos/${fullName}/commits/${encodedRef}`);
  await reportProgress?.("loading repository file tree", 18);
  const tree = await github<TreeResponse>(`/repos/${fullName}/git/trees/${commit.sha}?recursive=1`);
  if (tree.truncated) throw Object.assign(new Error("GitHub truncated this repository tree. Reduce the repository size or analyze a subdirectory."), { status: 413 });
  const selected = tree.tree.filter((entry) =>
    entry.type === "blob" && (SUPPORTED[extension(entry.path)] !== undefined) &&
    !EXCLUDED.test(entry.path) && (entry.size ?? 0) <= 250_000,
  ).slice(0, config.MAX_ANALYSIS_FILES);
  if (selected.length === 0) throw Object.assign(new Error("No supported JavaScript or TypeScript files were found in this branch."), { status: 422 });
  const totalBytes = selected.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
  if (totalBytes > config.MAX_ANALYSIS_BYTES) {
    throw Object.assign(new Error(`Selected source exceeds the ${Math.round(config.MAX_ANALYSIS_BYTES / 1_000_000)} MB analysis limit. Reduce MAX_ANALYSIS_FILES or analyze a smaller repository.`), { status: 413 });
  }

  let downloaded = 0;
  const files = await mapLimit(selected, 8, async (entry): Promise<SourceFile> => {
    const blob = await github<BlobResponse>(`/repos/${fullName}/git/blobs/${entry.sha}`);
    if (blob.encoding !== "base64") throw new Error(`Unsupported content encoding for ${entry.path}.`);
    const content = Buffer.from(blob.content, "base64").toString("utf8");
    downloaded += 1;
    if (downloaded % 25 === 0 || downloaded === selected.length) {
      await reportProgress?.(`downloading source files (${downloaded}/${selected.length})`, 20 + Math.round((downloaded / selected.length) * 10));
    }
    return { path: entry.path, content, language: SUPPORTED[extension(entry.path)] };
  });
  return { sha: commit.sha, files };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      result[index] = await fn(items[index]);
    }
  }));
  return result;
}
