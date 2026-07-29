import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("reward models and endpoints are first-class backend capabilities", async () => {
  const schemaSource = await readFile(
    join(rootDir, "packages/db/prisma/schema.prisma"),
    "utf8",
  );
  const serviceSource = await readFile(
    join(rootDir, "apps/api/src/app.service.ts"),
    "utf8",
  );
  const controllerSource = await readFile(
    join(rootDir, "apps/api/src/app.controller.ts"),
    "utf8",
  );

  assert.match(schemaSource, /model RewardRule/);
  assert.match(schemaSource, /model RewardLedger/);
  assert.match(schemaSource, /model Achievement/);
  assert.match(
    schemaSource,
    /@@unique\(\[patientId, eventType, eventId, ruleId\]\)/,
  );
  assert.match(serviceSource, /issueTrainingRewardsIfEligible/);
  assert.match(serviceSource, /training_result\.valid_completed/);
  assert.match(serviceSource, /rewardLedger\.upsert/);
  assert.match(controllerSource, /patients\/:id\/rewards/);
});

test("reward issuance tests require valid non-abnormal training result and reject duplicates", async () => {
  const serviceSpecSource = await readFile(
    join(rootDir, "apps/api/src/app.service.spec.ts"),
    "utf8",
  );

  assert.match(
    serviceSpecSource,
    /issues configured rewards once for valid non-abnormal training results/,
  );
  assert.match(
    serviceSpecSource,
    /does not issue rewards for suspicious or abnormal training results/,
  );
  assert.match(
    serviceSpecSource,
    /does not issue rewards for duplicate training result submissions/,
  );
  assert.match(serviceSpecSource, /rewardRule\.findMany\.mockResolvedValue/);
  assert.doesNotMatch(
    serviceSpecSource,
    /defaultReward|fallbackReward|demoReward/i,
  );
});

test("patient reward UI reads backend summary and does not calculate fake points locally", async () => {
  const pageSource = await readFile(
    join(rootDir, "apps/web/src/app/page.tsx"),
    "utf8",
  );
  const roleDataSource = await readFile(
    join(rootDir, "apps/web/src/features/session/useRoleData.ts"),
    "utf8",
  );
  const patientFlowSource = [
    await readFile(
      join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
      "utf8",
    ),
    await readFile(
      join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
      "utf8",
    ),
    await readFile(
      join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
      "utf8",
    ),
    await readFile(
      join(rootDir, "apps/web/src/features/patient/PatientWorkspacePage.tsx"),
      "utf8",
    ),
  ].join("\n");
  const apiSource = await readFile(
    join(rootDir, "apps/web/src/lib/api.ts"),
    "utf8",
  );
  const typeSource = await readFile(
    join(rootDir, "apps/web/src/types/api.ts"),
    "utf8",
  );
  const patientRoleBranchStart = roleDataSource.search(
    /if\s*\(\s*patientId\s*&&\s*role\s*===\s*"patient"\s*\)\s*\{/,
  );
  const doctorRoleBranchStart = roleDataSource.search(
    /if\s*\(\s*patientId\s*&&\s*role\s*===\s*"doctor"\s*\)\s*\{/,
  );

  assert.ok(patientRoleBranchStart >= 0);
  assert.ok(doctorRoleBranchStart > patientRoleBranchStart);
  const patientRoleBranchSource = roleDataSource.slice(
    patientRoleBranchStart,
    doctorRoleBranchStart,
  );

  assert.match(
    typeSource,
    /export type RewardSummaryResponse\s*=\s*\{\s*totalPoints:\s*number;\s*ledger:\s*RewardLedgerItem\[\];\s*achievements:\s*AchievementItem\[\];\s*\};/,
  );
  assert.match(
    apiSource,
    /patientRewards:\s*\(patientId:\s*string,\s*context:\s*ApiRequestContext\s*=\s*\{\}\)\s*=>\s*request<RewardSummaryResponse>\(\s*`\/patients\/\$\{patientId\}\/rewards`,\s*context,?\s*\),/,
  );
  assert.match(
    patientRoleBranchSource,
    /optionalRequests\.push\(\s*\{\s*panel:\s*"rewards",\s*label:\s*"康复奖励",\s*load:\s*async\s*\(\)\s*=>\s*\(\{\s*rewards:\s*await api\.patientRewards\(\s*patientId,\s*context,?\s*\),?\s*\}\),?\s*\},/,
  );
  assert.match(
    roleDataSource,
    /const optionalResult\s*=\s*await settleOptionalRoleData\(\s*optionalRequests,\s*context\.signal,?\s*\);[\s\S]*?setData\(\s*\(current\)\s*=>\s*\(\{\s*\.\.\.current,\s*\.\.\.optionalResult\.data,?\s*\}\)\s*\);/,
  );
  assert.doesNotMatch(
    pageSource,
    /function RewardProgressPanel|function TaskList/,
    "page shell must not retain legacy reward/task UI helpers after role-owned extraction",
  );
  assert.doesNotMatch(
    patientFlowSource,
    /RewardProgressPanel|RewardSummaryResponse|积分只来自|能力展示|积分|成就/,
    "minimal patient task flow must not expose reward mechanics in the primary UI",
  );
  assert.doesNotMatch(
    roleDataSource + patientFlowSource,
    /Math\.random|mock|demo|localStorage|score\s*\+\s*points|totalPoints\s*=\s*\d+/i,
  );
});
