import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubUrl } from "./client.js";

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
