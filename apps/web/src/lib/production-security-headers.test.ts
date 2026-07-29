import assert from "node:assert/strict";
import test from "node:test";
import { getProductionSecurityHeaders } from "./production-security-headers";

function productionEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): Partial<NodeJS.ProcessEnv> {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rehab.example",
    ...overrides,
  };
}

test("production headers constrain device access, framing, content, and API origin", () => {
  const headers = getProductionSecurityHeaders(productionEnvironment());
  const byName = new Map(headers.map((header) => [header.key, header.value]));

  assert.match(byName.get("Content-Security-Policy") ?? "", /default-src 'self'/);
  assert.match(
    byName.get("Content-Security-Policy") ?? "",
    /connect-src 'self' https:\/\/api\.rehab\.example/,
  );
  assert.match(byName.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(byName.get("X-Frame-Options"), "DENY");
  assert.equal(byName.get("X-Content-Type-Options"), "nosniff");
  assert.equal(byName.get("Referrer-Policy"), "no-referrer");
  assert.equal(
    byName.get("Strict-Transport-Security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(
    byName.get("Permissions-Policy"),
    "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  );
});

test("production headers fail closed without one exact HTTPS API origin", () => {
  for (const value of [
    undefined,
    " http://api.rehab.example",
    "http://api.rehab.example",
    "https://user:password@api.rehab.example",
    "https://api.rehab.example/v1",
    "https://api.rehab.example?token=secret",
  ]) {
    assert.throws(
      () =>
        getProductionSecurityHeaders(
          productionEnvironment({ NEXT_PUBLIC_API_BASE_URL: value }),
        ),
      /NEXT_PUBLIC_API_BASE_URL/,
    );
  }
});

test("development does not report production-only headers", () => {
  assert.deepEqual(
    getProductionSecurityHeaders({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:33117",
    }),
    [],
  );
});
