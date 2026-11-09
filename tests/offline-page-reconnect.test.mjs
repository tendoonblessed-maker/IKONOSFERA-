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

function bootOfflinePage({ onLine = false } = {}) {
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
  const navigator = { onLine };
  runInNewContext(script, { window, navigator });
  return { listeners, replacements, window, navigator };
}

test("offline fallback retries the app once when the browser reports connectivity", () => {
  assert.equal(html.split("<script>").length - 1, 1, "expected one small inline recovery script");
  assert.equal(html.split("</script>").length - 1, 1);

  const { listeners, replacements } = bootOfflinePage();
  const online = listeners.find((listener) => listener.type === "online");

  assert.ok(online, "expected an online recovery listener");
  assert.equal(online.options.once, true);
  online.callback();
  assert.deepEqual(replacements, ["/"]);
});

test("a BFCache restore retries when connectivity returned while the page was frozen", () => {
  const { listeners, replacements, navigator } = bootOfflinePage();
  const pageshow = listeners.find((listener) => listener.type === "pageshow");

  assert.ok(pageshow, "expected a pageshow recovery listener");
  navigator.onLine = true;
  pageshow.callback({ persisted: true });
  assert.deepEqual(replacements, ["/"]);
});

test("initial page show and offline BFCache restore do not trigger a navigation", () => {
  const { listeners, replacements } = bootOfflinePage();
  const pageshow = listeners.find((listener) => listener.type === "pageshow");

  assert.ok(pageshow);
  pageshow.callback({ persisted: false });
  pageshow.callback({ persisted: true });
  assert.deepEqual(replacements, []);
});

test("online and BFCache signals cannot trigger duplicate navigation", () => {
  const { listeners, replacements, navigator } = bootOfflinePage();
  const online = listeners.find((listener) => listener.type === "online");
  const pageshow = listeners.find((listener) => listener.type === "pageshow");

  assert.ok(online);
  assert.ok(pageshow);
  online.callback();
  navigator.onLine = true;
  pageshow.callback({ persisted: true });
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
