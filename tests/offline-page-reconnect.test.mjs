import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const html = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)];

test("offline fallback retries the app once when the browser reports connectivity", () => {
  assert.equal(scripts.length, 1, "expected one small inline recovery script");

  const listeners = [];
  const replacements = [];
  const window = {
    addEventListener(type, callback, options) {
      listeners.push({ type, callback, options });
    },
    location: {
      replace(path) {
        replacements.push(path);
      },
    },
  };

  runInNewContext(scripts[0][1], { window });

  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, "online");
  assert.equal(listeners[0].options.once, true);

  listeners[0].callback();
  assert.deepEqual(replacements, ["/"]);
});

test("offline fallback keeps manual retry and explains that messages are not stored here", () => {
  assert.match(html, /<a href="\\/">Повторить<\\/a>/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Сообщения не сохраняются на этом экране/);
  assert.match(html, /страница попробует открыть мессенджер автоматически/);
});

test("offline recovery does not add polling or browser storage", () => {
  assert.doesNotMatch(scripts[0][1], /setInterval|setTimeout|localStorage|sessionStorage/);
});
