import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const headers = Object.fromEntries(
  [...config.matchAll(/\{key:\s*"([^"]+)",\s*value:\s*"([^"]+)"\}/g)]
    .map(([, key, value]) => [key.toLowerCase(), value]),
);

test("security headers prevent framing and MIME sniffing on every route", () => {
  assert.match(config, /source:\s*["']\/\(\.\*\)["']/);
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["content-security-policy"], "frame-ancestors 'none'");
  assert.equal(headers["x-content-type-options"], "nosniff");
});

test("security headers preserve safe referrer, permission and HTTPS policies", () => {
  assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["permissions-policy"], "geolocation=(), payment=()");
  assert.equal(headers["strict-transport-security"], "max-age=31536000; includeSubDomains");
  assert.match(config, /poweredByHeader:\s*false/);
});
