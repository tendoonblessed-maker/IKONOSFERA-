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
const ORIGIN = "https://ikonosfera.test";

function bootOfflinePage({
  onLine = false,
  fetcher = async () => ({ ok: true, url: ORIGIN + "/" }),
  scheduleTimeout = setTimeout,
  cancelTimeout = clearTimeout
} = {}) {
  const listeners = [];
  const replacements = [];
  const calls = [];
  const window = {
    location: {
      href: ORIGIN + "/offline.html",
      origin: ORIGIN,
      replace(path) {
        replacements.push(path);
      }
    },
    addEventListener(type, callback, options) {
      listeners.push({ type, callback, options });
    }
  };
  const navigator = { onLine };
  const fetch = (url, options) => {
    calls.push({ url, options });
    return fetcher(url, options);
  };
  runInNewContext(script, {
    window,
    navigator,
    fetch,
    AbortController,
    URL,
    setTimeout: scheduleTimeout,
    clearTimeout: cancelTimeout
  });
  return { listeners, replacements, calls, window, navigator };
}

function listener(page, type) {
  const found = page.listeners.find((entry) => entry.type === type);
  assert.ok(found, `expected ${type} listener`);
  return found;
}

test("online recovery verifies the origin before navigating", async () => {
  const responses = [
    { ok: false, status: 503, url: ORIGIN + "/" },
    { ok: true, status: 200, url: ORIGIN + "/" }
  ];
  const page = bootOfflinePage({ fetcher: async () => responses.shift() });
  const online = listener(page, "online");

  await online.callback();
  assert.deepEqual(page.replacements, [], "a browser online signal alone must not reload the app");

  await online.callback();
  assert.deepEqual(page.replacements, ["/"], "a reachable origin permits one recovery navigation");
  assert.equal(page.calls.length, 2, "a failed probe must not consume future online events");
});

test("a successful probe is same-origin, uncached and bounded to response headers", async () => {
  const page = bootOfflinePage();
  await listener(page, "online").callback();

  assert.deepEqual(page.replacements, ["/"]);
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0].url, "/");
  assert.equal(page.calls[0].options.method, "GET");
  assert.equal(page.calls[0].options.cache, "no-store");
  assert.equal(page.calls[0].options.credentials, "same-origin");
  assert.equal(page.calls[0].options.signal.aborted, true, "unused HTML body is aborted after headers");
});

test("a BFCache restore probes the origin only when the browser reports a network", async () => {
  const page = bootOfflinePage({ onLine: true, fetcher: async () => ({ ok: true, url: ORIGIN + "/" }) });
  const pageshow = listener(page, "pageshow");

  await pageshow.callback({ persisted: false });
  assert.equal(page.calls.length, 0, "initial pageshow does not start a recovery probe");

  await pageshow.callback({ persisted: true });
  assert.equal(page.calls.length, 1);
  assert.deepEqual(page.replacements, ["/"]);
});

test("online and BFCache signals share one in-flight reachability probe", async () => {
  let resolveProbe;
  const page = bootOfflinePage({
    onLine: true,
    fetcher: () => new Promise((resolve) => { resolveProbe = resolve; })
  });

  const online = listener(page, "online").callback();
  const restored = listener(page, "pageshow").callback({ persisted: true });
  await Promise.resolve();
  assert.equal(page.calls.length, 1, "overlapping lifecycle signals must not duplicate the request");

  resolveProbe({ ok: true, url: ORIGIN + "/" });
  await Promise.all([online, restored]);
  assert.deepEqual(page.replacements, ["/"]);
});

test("network failures and non-success responses keep the offline page visible", async () => {
  const page = bootOfflinePage({
    fetcher: async () => { throw new TypeError("network unavailable"); }
  });
  await listener(page, "online").callback();
  assert.deepEqual(page.replacements, []);

  const serverError = bootOfflinePage({
    fetcher: async () => ({ ok: false, status: 504, url: ORIGIN + "/" })
  });
  await listener(serverError, "online").callback();
  assert.deepEqual(serverError.replacements, []);
});

test("a successful cross-origin redirect is not treated as app recovery", async () => {
  const page = bootOfflinePage({
    fetcher: async () => ({ ok: true, status: 200, url: "https://other.example/" })
  });
  await listener(page, "online").callback();
  assert.deepEqual(page.replacements, []);
});

test("a stalled reachability probe is aborted after the short deadline", async () => {
  let receivedSignal;
  const page = bootOfflinePage({
    fetcher: (_url, options) => {
      receivedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("probe timed out");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    },
    scheduleTimeout(callback, delay) {
      assert.equal(delay, 5000);
      callback();
      return 1;
    },
    cancelTimeout() {}
  });

  await listener(page, "online").callback();
  assert.equal(receivedSignal.aborted, true);
  assert.deepEqual(page.replacements, []);
});

test("manual retry remains available and recovery does not poll or store data", () => {
  assert.equal(html.split("<script>").length - 1, 1);
  assert.equal(html.split("</script>").length - 1, 1);
  assert.ok(html.includes('<a href="/">Повторить</a>'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes("Сообщения не сохраняются на этом экране"));
  assert.ok(html.includes("страница попробует открыть мессенджер автоматически"));
  assert.doesNotMatch(script, /setInterval|localStorage|sessionStorage/);
  assert.match(script, /RECONNECT_PROBE_TIMEOUT_MS\s*=\s*5000/);
});
