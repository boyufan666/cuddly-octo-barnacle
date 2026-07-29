import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  parseRenderBlueprintYaml,
  validateRenderBlueprint,
} from "../verify-render-blueprint.mjs";

const rootDir = resolve(import.meta.dirname, "../..");
const renderBlueprint = parseRenderBlueprintYaml(
  readFileSync(resolve(rootDir, "render.yaml"), "utf8"),
);
const workflow = readFileSync(
  resolve(rootDir, ".github/workflows/ci.yml"),
  "utf8",
);
const rootPackage = JSON.parse(
  readFileSync(resolve(rootDir, "package.json"), "utf8"),
);
const regressionRunner = readFileSync(
  resolve(rootDir, "scripts/run-full-regression.mjs"),
  "utf8",
);
const runtimeEventContract = readFileSync(
  resolve(rootDir, "scripts/__tests__/production-runtime-events.test.mjs"),
  "utf8",
);

test("Render Blueprint uses a parsed production contract with strict MiMo configuration and ready health checks", () => {
  assert.deepEqual(validateRenderBlueprint(renderBlueprint), []);
});

test("GitHub workflow pins official actions, scans full history, and runs disposable PostgreSQL regression", () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /branches:\n\s+- main\n\s+- production/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /concurrency:/);
  assert.match(
    workflow,
    /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4\.2\.2/,
  );
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(
    workflow,
    /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4\.4\.0/,
  );
  assert.doesNotMatch(workflow, /pnpm\/action-setup/);
  assert.match(workflow, /corepack install --global pnpm@10\.29\.3/);
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.doesNotMatch(
    workflow,
    /(?:cache:\s*pnpm|actions\/cache@)/,
    "CI must not ask an action to resolve the pnpm store before the pinned pnpm binary is activated",
  );
  const ciJobs = ["quality", "migration", "continuous-conversation-route"];
  for (const [index, jobName] of ciJobs.entries()) {
    const jobStart = workflow.indexOf(`  ${jobName}:`);
    const nextJobName = ciJobs[index + 1];
    const nextJobStart = nextJobName
      ? workflow.indexOf(`\n  ${nextJobName}:`, jobStart)
      : -1;
    const job = workflow.slice(
      jobStart,
      nextJobStart === -1 ? undefined : nextJobStart,
    );

    assert.ok(jobStart >= 0, `missing ${jobName} CI job`);
    assert.ok(
      job.indexOf("actions/setup-node@") <
        job.indexOf("Enable pinned pnpm through Corepack"),
      `${jobName} must select the pinned Node runtime before activating pnpm`,
    );
  }
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(
    workflow,
    /Scan complete Git history and staged candidate for credentials[\s\S]*node scripts\/scan-git-history-credentials\.mjs/,
  );
  assert.match(workflow, /node scripts\/scan-git-history-credentials\.mjs/);
  assert.match(
    workflow,
    /Verify committed deployment baseline[\s\S]*pnpm delivery:check -- --git-ref "\$GITHUB_SHA"/,
  );
  assert.match(workflow, /node scripts\/audit-dependencies\.mjs/);
  assert.match(
    workflow,
    /Validate Render Blueprint structure with Ruby Psych[\s\S]*pnpm verify:render-blueprint/,
  );
  assert.match(
    workflow,
    /Generate and verify production SBOM and customer license policy[\s\S]*pnpm verify:supply-chain:production/,
  );
  assert.match(
    workflow,
    /Upload non-sensitive production supply-chain artifacts[\s\S]*if: always\(\)[\s\S]*actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\.6\.2[\s\S]*name: production-supply-chain[\s\S]*path: output\/supply-chain\/\*\*[\s\S]*if-no-files-found: error[\s\S]*retention-days: 14/,
  );
  assert.match(workflow, /pnpm check:static/);
  assert.match(workflow, /pnpm test:unit/);
  assert.match(workflow, /image: redis:7\.2-alpine/);
  assert.match(workflow, /redis-cli ping/);
  assert.match(
    workflow,
    /MIMO_USAGE_GATE_REDIS_TEST_URL: redis:\/\/127\.0\.0\.1:6379\/15/,
  );
  assert.match(workflow, /MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE: YES/);
  assert.match(
    workflow,
    /pnpm --filter @rehab-platform\/api test:integration:mimo-usage-gate-redis/,
  );
  assert.match(workflow, /image: postgres:18-alpine/);
  assert.match(workflow, /POSTGRES_DB: rehab_ci/);
  assert.match(workflow, /pnpm db:migration:manifest:verify/);
  assert.match(workflow, /pnpm db:migrate:deploy/);
  assert.match(workflow, /pnpm db:migrate:status/);
  assert.match(
    workflow,
    /Run migration-backed disposable PostgreSQL regression/,
  );
  assert.match(workflow, /pnpm test:postgres/);
  assert.match(workflow, /TASK7_POSTGRES_CONTAINER="\$postgres_container"/);
  assert.match(workflow, /randomBytes\(32\)\.toString\('base64'\)/);
  assert.match(
    workflow,
    /API_SMOKE_SENSITIVE_DATA_KEY_REF=secret-manager:\/\/ci\/api-smoke-sensitive-key/,
  );
  assert.match(
    workflow,
    /TASK6_SEED_API_E2E_SENSITIVE_DATA_KEY_REF=secret-manager:\/\/ci\/task6-sensitive-key/,
  );
  assert.match(
    workflow,
    /SENSITIVE_DATA_KEY_REF=secret-manager:\/\/ci\/api-sensitive-key/,
  );
  assert.match(
    workflow,
    /continuous-conversation-route:[\s\S]*POSTGRES_DB: rehab_mimo_route_test[\s\S]*image: redis:7\.2-alpine/,
  );
  assert.match(
    workflow,
    /MIMO_ROUTE_E2E_REDIS_URL: redis:\/\/rehab-mimo-route-ci\.internal:6379\/14/,
  );
  assert.match(
    workflow,
    /Prove the real continuous conversation route shares its AI high-cost window[\s\S]*trap cleanup EXIT INT TERM[\s\S]*test:e2e:continuous-conversation-high-cost-route/,
  );
  assert.match(
    workflow,
    /sudo rm -f \/etc\/secrets\/rehab_mimo_route_ci_sensitive_data_key[\s\S]*sudo rm -f \/etc\/secrets\/rehab_mimo_route_ci_mimo_api_key/,
  );
  assert.doesNotMatch(workflow, /--ignore(?:\s|=)|ignore-unfixable/);
  assert.doesNotMatch(
    workflow,
    /(?:MIMO_API_KEY|AI_API_KEY|SPEECH_API_KEY|TTS_API_KEY|SENSITIVE_DATA_KEY)\s*:/,
  );
});

test("CI unit regression executes the production runtime event delivery contract", () => {
  assert.equal(
    rootPackage.scripts["test:delivery"],
    "node --test scripts/__tests__/*.test.mjs",
  );
  assert.match(
    regressionRunner,
    /unit: Object\.freeze\(\[[\s\S]*steps\.deliveryTests[\s\S]*\]\)/,
  );
  assert.match(workflow, /run: pnpm test:unit/);
  assert.match(runtimeEventContract, /runtime\.ready\.failed/);
  assert.match(runtimeEventContract, /ai\/conversations\/:id\/messages/);
});
