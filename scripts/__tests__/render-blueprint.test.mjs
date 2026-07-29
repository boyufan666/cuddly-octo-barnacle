import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  parseRenderBlueprintYaml,
  validateRenderBlueprint,
  verifyRenderBlueprint,
} from "../verify-render-blueprint.mjs";
import { regressionPlans } from "../run-full-regression.mjs";

const rootDir = resolve(import.meta.dirname, "../..");
const blueprintSource = readFileSync(resolve(rootDir, "render.yaml"), "utf8");

test("parses and validates the production Render Blueprint with Ruby Psych", () => {
  const parsed = parseRenderBlueprintYaml(blueprintSource);
  assert.equal(parsed.previews.generation, "off");
  assert.equal(Array.isArray(parsed.services), true);
  assert.equal(Array.isArray(parsed.databases), true);
  for (const name of [
    "rehab-platform-api-prod",
    "rehab-platform-web-prod",
    "rehab-platform-provider-telemetry-retention-prod",
  ]) {
    const service = parsed.services.find((entry) => entry.name === name);
    assert.ok(service, `missing ${name}`);
    assert.equal(service.autoDeployTrigger, "off");
  }
  assert.deepEqual(validateRenderBlueprint(parsed), []);
  assert.deepEqual(verifyRenderBlueprint(), parsed);
});

test("fails instead of falling back when Ruby Psych rejects malformed YAML", () => {
  assert.throws(
    () => parseRenderBlueprintYaml("services:\n  - name: missing\n    type"),
    /Ruby Psych could not parse render\.yaml/,
  );
});

test("validates deployment triggers, parsed Secret File paths, raw-secret prohibition, and service references", () => {
  const blueprint = structuredClone(parseRenderBlueprintYaml(blueprintSource));
  const api = blueprint.services.find(
    (service) => service.name === "rehab-platform-api-prod",
  );
  assert.ok(api);

  const mimoKeyFile = api.envVars.find(
    (entry) => entry.key === "MIMO_API_KEY_FILE",
  );
  assert.ok(mimoKeyFile);
  mimoKeyFile.value = "/tmp/not-an-approved-secret-file";
  const bootstrapConfigFile = api.envVars.find(
    (entry) => entry.key === "PRODUCTION_BOOTSTRAP_CONFIG_FILE",
  );
  assert.ok(bootstrapConfigFile);
  bootstrapConfigFile.value = "/etc/secrets/unapproved-bootstrap.json";
  api.envVars.push({ key: "MIMO_API_KEY", value: "inline-value" });

  const keyValueReference = api.envVars.find(
    (entry) => entry.key === "MIMO_KEY_VALUE_URL",
  );
  assert.ok(keyValueReference);
  keyValueReference.fromService.name = "unexpected-kv";

  const cron = blueprint.services.find(
    (service) =>
      service.name === "rehab-platform-provider-telemetry-retention-prod",
  );
  assert.ok(cron);
  cron.autoDeployTrigger = "checksPass";

  const errors = validateRenderBlueprint(blueprint);
  assert.equal(
    errors.some((error) => error.includes("/etc/secrets/mimo_api_key")),
    true,
  );
  assert.equal(
    errors.some((error) =>
      error.includes("/etc/secrets/production_bootstrap.json"),
    ),
    true,
  );
  assert.equal(
    errors.some((error) =>
      error.includes("must not define a raw production secret"),
    ),
    true,
  );
  assert.equal(
    errors.some(
      (error) =>
        error.includes("fromService.name") &&
        error.includes("rehab-platform-kv-prod"),
    ),
    true,
  );
  assert.equal(
    errors.some(
      (error) =>
        error.includes("render.yaml.services[3]") &&
        error.includes("autoDeployTrigger") &&
        error.includes("off"),
    ),
    true,
  );
});

test("registers parsed Blueprint validation in the static regression plan", () => {
  assert.equal(
    regressionPlans.static.some((step) => step.id === "render:blueprint"),
    true,
  );
});
