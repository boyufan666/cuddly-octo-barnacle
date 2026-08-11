const loopbackHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackHttpOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.origin === value &&
    url.protocol === "http:" &&
    loopbackHostnames.has(url.hostname) &&
    !url.username &&
    !url.password
  );
}
