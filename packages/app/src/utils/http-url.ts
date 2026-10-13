// Ported from getpaseo/paseo (Apache-2.0)
/** Shared allowlist for links passed to an OS opener or a workspace browser. */
export function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
