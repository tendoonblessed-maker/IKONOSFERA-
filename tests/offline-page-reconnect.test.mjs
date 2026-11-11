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
  const documentListeners = [];
  const retryListeners = [];
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
  const retryLink = {
    addEventListener(type, callback) {
      retryListeners.push({ type, callback });
    }
  };
  const document = {
    visibilityState: "visible",
    addEventListener(type, callback, options) {
      documentListeners.push({ type, callback, options });
    },
    getElementById(id) {
      return id === "retry-app" ? retryLink : null;
    }
  };
  const fetch = (url, options) => {
    calls.push({ url, options });
    return fetcher(url, options);
  };
  runInNewContext(script, {
    window,
    navigator,
    document,
    fetch,
    AbortController,
    URL,
    setTimeout: scheduleTimeout,
    clearTimeout: cancelTimeout
  });
  return { listeners, documentListeners, retryListeners, replacements, calls, window, navigator, document };
}

function listener(page, type) {
  const found = page.listeners.find((entry) => entry.type === type);
  assert.ok(found, `expected ${type} listener`);
  return found;
}

function documentListener(page, type) {
  const found = page.documentListeners.find((entry) => entry.type === type);
  assert.ok(found, `expected document ${type} listener`);
  return found;
}

function retryClick(page) {
  const found = page.retryListeners.find((entry) => entry.type === "click");
  assert.ok(found, "expected manual retry click listener");
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

test("an initially online browser probes the origin when the offline shell is first shown", async () => {
  const page = bootOfflinePage({
    onLine: true,
    fetcher: async () => ({ ok: false, status: 503, url: ORIGIN + "/" })
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.calls.length, 1, "initial display must not wait for a future online event");
  assert.deepEqual(page.replacements, [], "a transient origin failure keeps the offline shell visible");
  assert.equal(page.calls[0].options.signal.aborted, true);
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
  const page = bootOfflinePage();
  const pageshow = listener(page, "pageshow");

  await pageshow.callback({ persisted: false });
  assert.equal(page.calls.length, 0, "initial pageshow is covered by the initial probe gate");

  page.navigator.onLine = true;
  await pageshow.callback({ persisted: true });
  assert.equal(page.calls.length, 1);
  assert.deepEqual(page.replacements, ["/"]);
});

test("a visible tab retries after the origin recovers without another online event", async () => {
  const page = bootOfflinePage();
  page.navigator.onLine = true;
  page.document.visibilityState = "hidden";

  await documentListener(page, "visibilitychange").callback();
  assert.equal(page.calls.length, 0, "hidden pages must not start recovery requests");

  page.document.visibilityState = "visible";
  await documentListener(page, "visibilitychange").callback();
  assert.equal(page.calls.length, 1);
  assert.deepEqual(page.replacements, ["/"]);
});

test("online, BFCache and visibility signals share one in-flight reachability probe", async () => {
  let resolveProbe;
  const page = bootOfflinePage({
    fetcher: () => new Promise((resolve) => { resolveProbe = resolve; })
  });
  page.navigator.onLine = true;

  const online = listener(page, "online").callback();
  const restored = listener(page, "pageshow").callback({ persisted: true });
  const visible = documentListener(page, "visibilitychange").callback();
  await Promise.resolve();
  assert.equal(page.calls.length, 1, "overlapping lifecycle signals must not duplicate the request");

  resolveProbe({ ok: true, url: ORIGIN + "/" });
  await Promise.all([online, restored, visible]);
  assert.deepEqual(page.replacements, ["/"]);
});

test("manual retry uses the bounded origin probe instead of bypassing the offline fallback", async () => {
  const responses = [
    { ok: false, status: 503, url: ORIGIN + "/" },
    { ok: true, status: 200, url: ORIGIN + "/" }
  ];
  const page = bootOfflinePage({ fetcher: async () => responses.shift() });
  let prevented = false;

  await retryClick(page).callback({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, "the anchor's direct navigation is intercepted when JavaScript is available");
  assert.deepEqual(page.replacements, [], "a failed probe must keep the offline page visible");

  await retryClick(page).callback({ preventDefault() { prevented = true; } });
  assert.deepEqual(page.replacements, ["/"], "manual retry navigates only after the origin responds");
  assert.equal(page.calls.length, 2);
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
        const abort = () => {
          const error = new Error("probe timed out");
          error.name = "AbortError";
          reject(error);
        };
        if (options.signal.aborted) abort();
        else options.signal.addEventListener("abort", abort, { once: true });
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
  assert.ok(html.includes('<a id="retry-app" href="/">Повторить</a>'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes("Сообщения не сохраняются на этом экране"));
  assert.ok(html.includes("страница попробует открыть мессенджер автоматически"));
  assert.doesNotMatch(script, /setInterval|localStorage|sessionStorage/);
  assert.match(script, /RECONNECT_PROBE_TIMEOUT_MS\s*=\s*5000/);
});
