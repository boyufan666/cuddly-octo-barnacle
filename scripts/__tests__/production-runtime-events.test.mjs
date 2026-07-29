import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const rootDir = resolve(import.meta.dirname, "../..");
const readSource = (relativePath) =>
  readFileSync(resolve(rootDir, relativePath), "utf8");

const runtimeEventSource = readSource(
  "apps/api/src/production-runtime-event.ts",
);
const mainSource = readSource("apps/api/src/main.ts");
const readinessSource = readSource("apps/api/src/runtime-readiness.service.ts");
const rateLimitSource = readSource(
  "apps/api/src/mimo-high-cost-rate-limit.guard.ts",
);
const appServiceSource = readSource("apps/api/src/app.service.ts");
const retentionSource = readSource(
  "apps/api/src/provider-telemetry-retention.ts",
);
const controllerSource = readSource("apps/api/src/app.controller.ts");

const expectedEventCodes = [
  "runtime.ready.failed",
  "runtime.required_secret_file.failed",
  "runtime.key_value.failed",
  "mimo.high_cost.rejected",
  "mimo.provider.failed",
  "mimo.provider.audit_write.failed",
  "mimo.provider.telemetry_write.failed",
  "provider_telemetry.retention.failed",
];

test("production runtime alert candidates use one strict allowlist serializer", () => {
  const configuredCodes = [
    ...runtimeEventSource.matchAll(/^  '([^']+)',$/gm),
  ].map((match) => match[1]);
  assert.deepEqual(configuredCodes, expectedEventCodes);
  assert.match(runtimeEventSource, /switch \(event\.eventCode\)/);
  assert.match(
    runtimeEventSource,
    /throw new Error\('Unsupported production runtime event code\.'\)/,
  );
  assert.doesNotMatch(runtimeEventSource, /\.\.\.|catch\s*\(|fallback/i);
  assert.doesNotMatch(
    runtimeEventSource,
    /\b(?:apiKey|audio|transcript|clinical|patient|userId|organizationId|metadata|message)\b/,
  );
});

test("every required production failure path emits its fixed event category", () => {
  assert.match(mainSource, /runtime\.required_secret_file\.failed/);
  assert.match(mainSource, /runtime\.key_value\.failed/);
  assert.match(readinessSource, /runtime\.ready\.failed/);
  assert.match(rateLimitSource, /mimo\.high_cost\.rejected/);
  assert.match(appServiceSource, /mimo\.high_cost\.rejected/);
  assert.match(appServiceSource, /mimo\.provider\.failed/);
  assert.match(appServiceSource, /mimo\.provider\.audit_write\.failed/);
  assert.match(appServiceSource, /mimo\.provider\.telemetry_write\.failed/);
  assert.match(retentionSource, /provider_telemetry\.retention\.failed/);
});

test("all four provider-calling routes, including conversation append, have the shared high-cost guard", () => {
  const guardedRoutes = [
    ["ai", "ai/assessment-drafts"],
    ["ai", "ai/conversations/:id/messages"],
    ["speech", "ai/assessment-speech-transcripts"],
    ["tts", "ai/tts-speech-outputs"],
  ];

  for (const [operation, route] of guardedRoutes) {
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      controllerSource,
      new RegExp(
        `@MimoHighCostOperation\\('${operation}'\\)\\s+` +
          `@UseGuards\\(AuthGuard, MimoHighCostRateLimitGuard\\)\\s+` +
          `@Post\\('${escapedRoute}'\\)`,
      ),
    );
  }
});
