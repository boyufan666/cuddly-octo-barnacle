type SecurityHeader = {
  key: string;
  value: string;
};

const localHttpHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

function requireLocalHttpApiOrigin(environment: Partial<NodeJS.ProcessEnv>) {
  const rawValue = environment.NEXT_PUBLIC_API_BASE_URL;
  if (!rawValue || rawValue.trim() !== rawValue) {
    throw new Error(
      "本地 HTTP 模式的 NEXT_PUBLIC_API_BASE_URL 必须是精确的回环地址。",
    );
  }
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(
      "本地 HTTP 模式的 NEXT_PUBLIC_API_BASE_URL 必须是精确的回环地址。",
    );
  }
  if (
    url.protocol !== "http:" ||
    !localHttpHostnames.has(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "本地 HTTP 模式的 NEXT_PUBLIC_API_BASE_URL 必须是精确的回环地址。",
    );
  }
  return url.origin;
}

function requireProductionApiOrigin(environment: Partial<NodeJS.ProcessEnv>) {
  const rawValue = environment.NEXT_PUBLIC_API_BASE_URL;
  if (!rawValue || rawValue.trim() !== rawValue) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be an exact HTTPS API origin in production.",
    );
  }
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be an exact HTTPS API origin in production.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be an exact HTTPS API origin in production.",
    );
  }
  return url.origin;
}

function buildSecurityHeaders(
  apiOrigin: string,
  includeStrictTransport: boolean,
): SecurityHeader[] {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${apiOrigin}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");

  return [
    {
      key: "Content-Security-Policy",
      value: contentSecurityPolicy,
    },
    ...(includeStrictTransport
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ]
      : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
    },
  ];
}

export function getProductionSecurityHeaders(
  environment: Partial<NodeJS.ProcessEnv> = process.env,
): SecurityHeader[] {
  if (environment.NODE_ENV !== "production") {
    return [];
  }

  if (environment.COOKIE_SECURE === "false") {
    return buildSecurityHeaders(requireLocalHttpApiOrigin(environment), false);
  }

  return buildSecurityHeaders(requireProductionApiOrigin(environment), true);
}
