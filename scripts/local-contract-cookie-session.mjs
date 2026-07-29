const sessionCookieName = "rehab_session";
const csrfCookieName = "rehab_csrf";
const csrfHeaderName = "x-csrf-token";

class CookieSessionError extends Error {
  constructor(message) {
    super(message);
    this.name = "CookieSessionError";
  }
}

class CookieJar {
  #cookies = new Map();

  apply(setCookieHeaders, responseUrl) {
    for (const header of setCookieHeaders) {
      const parts = header.split(";");
      const separator = parts[0].indexOf("=");
      if (separator < 1) {
        throw new CookieSessionError("Cookie 会话响应 cookie 无效。");
      }

      const name = parts[0].slice(0, separator).trim();
      const value = parts[0].slice(separator + 1).trim();
      const attributes = new Map();
      for (const part of parts.slice(1)) {
        const attributeSeparator = part.indexOf("=");
        const attributeName = (
          attributeSeparator < 0 ? part : part.slice(0, attributeSeparator)
        )
          .trim()
          .toLowerCase();
        const attributeValue =
          attributeSeparator < 0
            ? true
            : part.slice(attributeSeparator + 1).trim();
        attributes.set(attributeName, attributeValue);
      }

      const path = resolveCookiePath(attributes.get("path"), responseUrl);
      const secure = attributes.has("secure");
      let expiresAt;
      if (attributes.has("max-age")) {
        const maxAgeText = String(attributes.get("max-age"));
        if (!/^-?\d+$/.test(maxAgeText)) {
          throw new CookieSessionError("Cookie 会话响应 cookie 无效。");
        }
        const maxAge = Number(maxAgeText);
        if (!Number.isSafeInteger(maxAge)) {
          throw new CookieSessionError("Cookie 会话响应 cookie 无效。");
        }
        if (maxAge <= 0) {
          this.#delete(name, path);
          continue;
        }
        expiresAt = Date.now() + maxAge * 1000;
      } else if (attributes.has("expires")) {
        expiresAt = Date.parse(String(attributes.get("expires")));
        if (!Number.isFinite(expiresAt)) {
          throw new CookieSessionError("Cookie 会话响应 cookie 无效。");
        }
        if (expiresAt <= Date.now()) {
          this.#delete(name, path);
          continue;
        }
      }

      const cookiesByPath = this.#cookies.get(name) ?? new Map();
      cookiesByPath.set(path, { name, path, value, expiresAt, secure });
      this.#cookies.set(name, cookiesByPath);
    }
  }

  get(name, requestUrl) {
    return this.#matchingCookies(requestUrl).find(
      (cookie) => cookie.name === name,
    )?.value;
  }

  toHeader(requestUrl) {
    return this.#matchingCookies(requestUrl)
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
  }

  #delete(name, path) {
    const cookiesByPath = this.#cookies.get(name);
    if (!cookiesByPath) return;
    cookiesByPath.delete(path);
    if (cookiesByPath.size === 0) this.#cookies.delete(name);
  }

  #matchingCookies(requestUrl) {
    const matches = [];
    const now = Date.now();
    for (const [name, cookiesByPath] of this.#cookies) {
      for (const [path, cookie] of cookiesByPath) {
        if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
          cookiesByPath.delete(path);
          continue;
        }
        if (cookie.secure && requestUrl.protocol !== "https:") continue;
        if (cookiePathMatches(requestUrl.pathname, path)) {
          matches.push(cookie);
        }
      }
      if (cookiesByPath.size === 0) this.#cookies.delete(name);
    }
    return matches.sort((left, right) => right.path.length - left.path.length);
  }
}

function resolveCookiePath(pathAttribute, responseUrl) {
  if (typeof pathAttribute === "string" && pathAttribute.startsWith("/")) {
    return pathAttribute;
  }
  const pathname = responseUrl.pathname;
  if (!pathname.startsWith("/") || pathname === "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

function cookiePathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

export class CookieSessionClient {
  #baseUrl;
  #cookies = new CookieJar();

  constructor(baseUrl) {
    try {
      this.#baseUrl = new URL(baseUrl);
    } catch {
      throw new CookieSessionError("Cookie 会话 API 地址无效。");
    }
  }

  async login(account, password) {
    try {
      const csrfResponse = await this.request("/auth/csrf");
      const loginUrl = new URL("/auth/login", this.#baseUrl);
      const csrfCookie = this.#cookies.get(csrfCookieName, loginUrl);
      if (
        typeof csrfResponse?.csrfToken !== "string" ||
        csrfResponse.csrfToken !== csrfCookie
      ) {
        throw new CookieSessionError("Cookie 会话 CSRF 建立失败。");
      }

      const loginResponse = await this.request("/auth/login", {
        method: "POST",
        body: { account, password },
      });
      if (loginResponse?.status === "password_reset_required") {
        throw new CookieSessionError(
          "Cookie 会话登录失败：password_reset_required，需先人工完成密码重置。",
        );
      }
      if (
        loginResponse?.status !== "authenticated" ||
        typeof loginResponse.context !== "object" ||
        loginResponse.context === null ||
        Array.isArray(loginResponse.context)
      ) {
        throw new CookieSessionError("Cookie 会话登录响应格式无效。");
      }
      if (!this.#cookies.get(sessionCookieName, new URL("/", this.#baseUrl))) {
        throw new CookieSessionError(
          "Cookie 会话登录缺少 rehab_session cookie。",
        );
      }
      return loginResponse;
    } catch (error) {
      if (error instanceof CookieSessionError) throw error;
      throw new CookieSessionError("Cookie 会话登录失败。");
    }
  }

  async request(path, options = {}) {
    try {
      const method = (options.method ?? "GET").toUpperCase();
      const requestUrl = new URL(path, this.#baseUrl);
      const headers = new Headers(options.headers);
      headers.delete("Authorization");
      headers.delete("Cookie");
      headers.delete(csrfHeaderName);
      const cookieHeader = this.#cookies.toHeader(requestUrl);
      if (cookieHeader) headers.set("Cookie", cookieHeader);
      if (options.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }
      if (method !== "GET" && method !== "HEAD") {
        const csrfToken = this.#cookies.get(csrfCookieName, requestUrl);
        if (!csrfToken) {
          throw new CookieSessionError(
            "Cookie 会话请求缺少 rehab_csrf cookie。",
          );
        }
        headers.set(csrfHeaderName, csrfToken);
      }

      const response = await fetch(requestUrl, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      this.#cookies.apply(
        response.headers.getSetCookie(),
        new URL(response.url),
      );

      const body = await readResponseBody(response);
      const statusMatches =
        options.expectedStatus === undefined
          ? response.ok
          : response.status === options.expectedStatus;
      if (!statusMatches) {
        throw new CookieSessionError(
          `HTTP ${response.status}：Cookie 会话请求失败。`,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof CookieSessionError) throw error;
      throw new CookieSessionError("Cookie 会话请求失败。");
    }
  }
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
