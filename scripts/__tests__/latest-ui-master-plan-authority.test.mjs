import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const latestPlanPath =
  "docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md";

test("latest master UI plan is the single execution entry point", async () => {
  const latestPlan = await readFile(join(rootDir, latestPlanPath), "utf8");
  const previousCompletePlan = await readFile(
    join(
      rootDir,
      "docs/superpowers/plans/2026-06-09-minimal-premium-ui-complete-overhaul-plan.md",
    ),
    "utf8",
  );

  for (const phrase of [
    "Single Source Of Execution Truth",
    "Do not execute older UI plans directly",
    "Current Verified State",
    "Why There Were Several Plans",
    "Adjacent Historical Capability Plans",
    "2026-05-24-unity-rhythm-reach-3d-implementation-plan.md",
    "2026-06-03-docx-gap-closure.md",
    "Open Global Gaps",
    "Unit 2 is complete in code and tests",
    "role-workspace.tsx remains the highest-risk frontend boundary",
    "formal Playwright chain must carry the same IDs across login, assessment, plan, preparation, training, result, review, caregiver, audit, and export",
    "No fallback, mock, demo, fake readiness, fake result, fake success, silent downgrade, or route fulfill may be added without explicit user approval",
    "If fallback is necessary, stop and ask the user before implementing it",
    "Doctor preparation must be performed through the visible `准备` workspace",
    "assessment/risk review must persist through a real API and be visible after reload",
    "caregiver progress must prove desensitized refreshed visibility",
    "Completion is impossible until every unit has RED, GREEN, review, and evidence",
  ]) {
    assert.match(
      latestPlan,
      new RegExp(escapeRegExp(phrase)),
      `latest plan missing authority phrase: ${phrase}`,
    );
  }

  assert.match(
    previousCompletePlan,
    /Superseded by the 2026-06-10 master closure plan/,
  );
  assert.match(previousCompletePlan, new RegExp(escapeRegExp(latestPlanPath)));
  assert.doesNotMatch(
    previousCompletePlan,
    /This plan is the authoritative execution plan for all remaining UI work|This plan is the authoritative execution plan\./,
    "superseded 2026-06-09 plan must not still claim current authority",
  );
});

test("all older plans defer to the 2026-06-10 master for current UI execution", async () => {
  const planDir = join(rootDir, "docs/superpowers/plans");
  const planFiles = (await readdir(planDir)).filter(
    (fileName) =>
      fileName.endsWith(".md") && fileName !== latestPlanPath.split("/").at(-1),
  );

  assert.ok(planFiles.length > 0, "expected historical plan files to check");

  for (const fileName of planFiles) {
    const plan = await readFile(join(planDir, fileName), "utf8");

    assert.match(
      plan,
      new RegExp(escapeRegExp(latestPlanPath)),
      `${fileName} must point current UI execution to the 2026-06-10 master plan`,
    );
    assert.match(
      plan,
      /Superseded|not the current UI execution plan|not the current execution plan|do not use its technical UI surfaces as the target product experience|Current UI closure work is now governed/i,
      `${fileName} must clearly state it is historical or not current UI execution`,
    );
  }
});

test("formal UI business chain captures real same-ID browser evidence", async () => {
  const formalSpec = await readFile(
    join(rootDir, "scripts/formal-ui-business-chain.spec.mjs"),
    "utf8",
  );

  assert.doesNotMatch(formalSpec, /page\.route\([\s\S]*fulfill/);
  assert.match(formalSpec, /waitForResponse\([\s\S]*training-sessions/);
  assert.match(
    formalSpec,
    /waitForResponse\([\s\S]*(?:training-sessions\/[^"`']+\/results|training-results)/,
  );
  assert.match(
    formalSpec,
    /waitForResponse\([\s\S]*assessments\/[^"`']+\/review/,
  );
  assert.match(
    formalSpec,
    /waitForResponse\([\s\S]*rehab-plans\/[^"`']+\/confirm/,
  );
  assert.match(formalSpec, /waitForResponse\([\s\S]*collection-batches/);
  assert.match(
    formalSpec,
    /waitForResponse\([\s\S]*training-results\/[^"`']+\/review/,
  );
  assert.match(
    formalSpec,
    /reloadAuthenticatedAndCaptureJson\(\s*doctorReviewPage,\s*"doctor001",\s*"workbench",\s*"待复核训练结果",\s*"GET",\s*new RegExp\(\s*`\/patients\/\$\{escapeRegExp\(chainIds\.patientId\)\}\/training-records\$`/,
    "doctor review must reload authenticated training records before selecting the submitted result",
  );
  assert.match(
    formalSpec,
    /sessionResponse\.status\(\)[\s\S]*toBe\(200\)[\s\S]*user:\s*\{ account \}/,
    "authenticated reload must verify the restored account through GET /me",
  );
  assert.match(
    formalSpec,
    /pendingReviewSessions[\s\S]*toHaveLength\(1\)[\s\S]*reviewQueueItem[\s\S]*toHaveCount\(1\)/,
    "doctor review must bind one persisted training session to one visible queue item",
  );
  assert.match(
    formalSpec,
    /persistedReviewedSessions[\s\S]*reviewStatus:\s*"reviewed"[\s\S]*reviewQueueItem\)\.toHaveCount\(0\)/,
    "doctor review must verify persisted review state before asserting queue removal",
  );
  assert.doesNotMatch(formalSpec, /if\s*\(!restoredSession\)[\s\S]*login\(/);
  assert.match(formalSpec, /audit-logs/);
  for (const action of [
    "assessment.review",
    "rehab_plan.confirm",
    "collection_batch.create",
    "training_session.start",
    "training_result.submit",
    "training_result.review",
    "data.export",
  ]) {
    assert.match(
      formalSpec,
      new RegExp(`assertAuditResponseContains[\\s\\S]*${escapeRegExp(action)}`),
      `formal chain must assert audit evidence for ${action}`,
    );
  }
  assert.match(formalSpec, /expectedExportReasonHash/);
  assert.match(
    formalSpec,
    /const exportReason = `[^`]*\$\{chainIds\.trainingSessionId\}[^`]*`/,
    "formal export reason must be unique to the current training session",
  );
  assert.match(formalSpec, /metadata\?\.reasonHash/);
  assert.match(formalSpec, /chainIds/);
  assert.match(formalSpec, /expectSameChainId/);
  assert.match(
    formalSpec,
    /chainIds\.trainingResultCreatedAt\s*=\s*trainingResult\.createdAt/,
    "formal chain must capture the actual created training result timestamp before caregiver review",
  );
  assert.match(
    formalSpec,
    /session\.result\?\.createdAt\s*===\s*chainIds\.trainingResultCreatedAt/,
    "caregiver progress must match the refreshed training entry by actual result timestamp, not by session status alone",
  );
  assert.doesNotMatch(
    formalSpec,
    /session\.sessionStatus\s*===\s*["']completed["']\s*&&\s*session\.gameContent\?\.name\s*===\s*chainIds\.trainingGameName\s*&&\s*session\.result\?\.createdAt/,
    "formal caregiver assertion must not require completed status for suspicious saved results that are doctor-reviewed",
  );
  assert.doesNotMatch(formalSpec, /operator001/);
});

test("formal UI business chain API preset uses isolated cookie sessions and CSRF", async () => {
  const formalSpec = await readFile(
    join(rootDir, "scripts/formal-ui-business-chain.spec.mjs"),
    "utf8",
  );

  assert.doesNotMatch(
    formalSpec,
    /\baccessToken\b|\bAuthorization\b|\bBearer\b/,
  );
  assert.match(formalSpec, /request\s+as\s+playwrightRequest/);
  assert.match(formalSpec, /playwrightRequest\.newContext\(/);
  assert.match(formalSpec, /rehab_csrf/);
  assert.match(formalSpec, /["']X-CSRF-Token["']/);
  assert.match(formalSpec, /rehab_session/);
  assert.match(formalSpec, /finally\s*\{[\s\S]*disposeRoleApiClients/);
  assert.doesNotMatch(
    formalSpec,
    /(?:^|[,{]\s*)(?:cookie|["'`]cookie["'`]|\[\s*["'`]cookie["'`]\s*\])\s*:|\.\s*(?:set|append)\s*\(\s*["'`]cookie["'`]|\.\.\.\s*(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*headers\b/im,
    "API presets must let APIRequestContext manage cookies instead of injecting Cookie headers",
  );
});

test("latest master UI plan final matrix keeps all formal verifier blockers explicit", async () => {
  const latestPlan = await readFile(join(rootDir, latestPlanPath), "utf8");
  const verificationMatrix = latestPlan.slice(
    latestPlan.indexOf("## Verification Matrix"),
    latestPlan.indexOf("## Blocker Log"),
  );

  for (const command of [
    "pnpm verify:contracts",
    "pnpm verify:formal-acceptance-chain",
    "pnpm verify:multi-condition-data-capture",
    "pnpm verify:browser-pose-evidence",
    "pnpm verify:browser-pose-field-acceptance",
    "pnpm verify:unity-field-evidence",
    "pnpm verify:unity-field-acceptance",
    "pnpm verify:speech-transcript-evidence",
    "pnpm verify:speech-transcript-acceptance",
    "pnpm verify:ai-assessment-acceptance",
    "pnpm verify:speech-ai-assessment-acceptance",
    "pnpm verify:tts-speech-output-evidence",
    "pnpm verify:tts-speech-output-acceptance",
    "pnpm verify:customer-acceptance-package-manifest",
    "pnpm delivery:check",
    "pnpm test:playwright",
  ]) {
    assert.match(
      verificationMatrix,
      new RegExp(escapeRegExp(command)),
      `final verification matrix missing ${command}`,
    );
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
