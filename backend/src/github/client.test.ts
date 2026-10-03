import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../config.js";
import { getRepository, parseGitHubUrl } from "./client.js";

test("accepts canonical GitHub HTTPS repository URLs", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/storefront.git"), {
    owner: "acme", name: "storefront", fullName: "acme/storefront",
  });
});

test("rejects non-GitHub hosts and malformed repository paths", () => {
  assert.throws(() => parseGitHubUrl("https://example.com/acme/storefront"), /Only https:\/\/github.com/);
  assert.throws(() => parseGitHubUrl("https://github.com/acme"), /exactly an owner and repository/);
  assert.throws(() => parseGitHubUrl("javascript:alert(1)"), /Only https:\/\/github.com/);
});

test("retries public repository requests anonymously when the configured token is invalid", async () => {
  const originalToken = config.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const authorization: Array<string | null> = [];
  config.GITHUB_TOKEN = "invalid-test-token";
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    authorization.push(headers.get("Authorization"));
    if (headers.has("Authorization")) {
      return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
    }
    return new Response(JSON.stringify({ id: 1, full_name: "acme/storefront", html_url: "https://github.com/acme/storefront", default_branch: "main", private: false }), { status: 200 });
  };
  try {
    const repository = await getRepository("acme/storefront");
    assert.equal(repository.full_name, "acme/storefront");
    assert.deepEqual(authorization, ["Bearer invalid-test-token", null]);
  } finally {
    config.GITHUB_TOKEN = originalToken;
    globalThis.fetch = originalFetch;
  }
});

test("does not retry rate-limited GitHub requests anonymously", async () => {
  const originalToken = config.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  let requests = 0;
  config.GITHUB_TOKEN = "configured-test-token";
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    });
  };
  try {
    await assert.rejects(getRepository("acme/storefront"), /rate limit exceeded/i);
    assert.equal(requests, 1);
  } finally {
    config.GITHUB_TOKEN = originalToken;
    globalThis.fetch = originalFetch;
  }
});
