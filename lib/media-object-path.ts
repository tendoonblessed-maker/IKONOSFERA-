const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSIONS = "jpg|png|webp|mp4|webm|mov|mp3|m4a|wav|ogg|pdf|txt|zip|doc|docx|xls|xlsx";
const SAFE_MEDIA_OBJECT_PATH = new RegExp("^" + UUID + "/" + UUID + "\\.(?:" + EXTENSIONS + ")$", "i");
const LEGACY_IMAGE_OBJECT_PATH = /^[a-z0-9-]+\/[a-z0-9.-]+\.(?:jpg|png|webp)$/i;

export const MEDIA_DELETE_TIMEOUT_MS = 18000;

/** Only accept object paths produced by this app's media upload helpers. */
export function isSafeMediaObjectPath(path: unknown): path is string {
  return typeof path === "string" && (SAFE_MEDIA_OBJECT_PATH.test(path) || LEGACY_IMAGE_OBJECT_PATH.test(path));
}

/** Build a Storage object URL without allowing arbitrary or traversal paths. */
export function mediaObjectUrl(baseUrl: string, path: unknown): string | null {
  if (!baseUrl.trim() || !isSafeMediaObjectPath(path)) return null;
  const root = baseUrl.replace(/\/+$/, "");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return root + "/storage/v1/object/ikonosfera-media/" + encodedPath;
}

function mediaDeleteTimeoutError(): Error {
  const error = new Error("Удаление файла не завершилось вовремя. Проверь подключение и повтори попытку.");
  error.name = "TimeoutError";
  return error;
}

/** Race both response headers and error-body parsing against the same deadline. */
function withMediaDeleteDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(mediaDeleteTimeoutError());
      return;
    }
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(mediaDeleteTimeoutError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/** Perform an authenticated, bounded Storage DELETE; a missing object is already cleaned up. */
export async function deleteMediaObject(
  baseUrl: string,
  path: unknown,
  token: string,
  publicKey: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = MEDIA_DELETE_TIMEOUT_MS
): Promise<void> {
  const url = mediaObjectUrl(baseUrl, path);
  if (!url) return;

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : MEDIA_DELETE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await withMediaDeleteDeadline(Promise.resolve(fetcher(url, {
      method: "DELETE",
      headers: { apikey: publicKey, Authorization: "Bearer " + token },
      signal: controller.signal
    })), controller.signal);
    if (!response.ok && response.status !== 404) {
      let payload: { message?: unknown } | null = null;
      try {
        payload = await withMediaDeleteDeadline(response.json(), controller.signal) as { message?: unknown } | null;
      } catch {
        if (controller.signal.aborted) throw mediaDeleteTimeoutError();
        // Keep the previous generic Storage error when the response body is unreadable.
      }
      throw new Error(typeof payload?.message === "string" ? payload.message : "Не удалось удалить файл");
    }
  } catch (error) {
    if (controller.signal.aborted) throw mediaDeleteTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
