import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const html = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");
const scriptStart = html.indexOf("<script>");
const scriptEnd = html.indexOf("</script>", scriptStart);
const script = scriptStart >= 0 && scriptEnd > scriptStart
  ? html.slice(scriptStart + "<script>".length, scriptEnd)
  : "";

test("offline fallback retries the app once when the browser reports connectivity", () => {
  assert.equal(html.split("<script>").length - 1, 1, "expected one small inline recovery script");
  assert.equal(html.split("</script>").length - 1, 1);

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

  runInNewContext(script, { window });

  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, "online");
  assert.equal(listeners[0].options.once, true);

  listeners[0].callback();
  assert.deepEqual(replacements, ["/"]);
});

test("offline fallback keeps manual retry and explains that messages are not stored here", () => {
  assert.ok(html.includes('<a href="/">Повторить</a>'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes("Сообщения не сохраняются на этом экране"));
  assert.ok(html.includes("страница попробует открыть мессенджер автоматически"));
});

test("offline recovery does not add polling or browser storage", () => {
  assert.doesNotMatch(script, /setInterval|setTimeout|localStorage|sessionStorage/);
});
