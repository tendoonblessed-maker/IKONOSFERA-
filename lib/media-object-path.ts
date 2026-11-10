const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSIONS = "jpg|png|webp|mp4|webm|mov|mp3|m4a|wav|ogg|pdf|txt|zip|doc|docx|xls|xlsx";
const SAFE_MEDIA_OBJECT_PATH = new RegExp("^" + UUID + "/" + UUID + "\\.(?:" + EXTENSIONS + ")$", "i");
const LEGACY_IMAGE_OBJECT_PATH = /^[a-z0-9-]+\/[a-z0-9.-]+\.(?:jpg|png|webp)$/i;

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
