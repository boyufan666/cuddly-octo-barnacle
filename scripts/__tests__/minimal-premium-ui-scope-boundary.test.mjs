import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("minimal premium UI plan keeps business gates and removes demo-first surfaces", async () => {
  const plan = await readFile(
    join(rootDir, "docs/superpowers/plans/2026-06-07-minimal-premium-ui-business-closure.md"),
    "utf8",
  );
  const rebuildPlan = await readFile(
    join(rootDir, "docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md"),
    "utf8",
  );
  const currentRebuildPlan = await readFile(
    join(rootDir, "docs/superpowers/plans/2026-06-09-minimal-premium-ui-rebuild-plan.md"),
    "utf8",
  );
  const completeOverhaulPlan = await readFile(
    join(rootDir, "docs/superpowers/plans/2026-06-09-minimal-premium-ui-complete-overhaul-plan.md"),
    "utf8",
  );
  const masterClosurePlan = await readFile(
    join(rootDir, "docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md"),
    "utf8",
  );
  const formalUiBusinessChain = await readFile(
    join(rootDir, "scripts/formal-ui-business-chain.spec.mjs"),
    "utf8",
  );

  for (const phrase of [
    "Do not add fallback",
    "must first be confirmed by the user",
    "must not be implemented",
    "simple, premium, role-focused rehabilitation product",
    "not a demo screen, technology console, or acceptance package browser",
    "One primary task per patient/caregiver screen",
    "Patient training start must require the existing formal chain",
    "A formal training loop is incomplete until a doctor reviews",
    "Existing training categories remain",
    "risk measurement support, plan variety, intervention matching, and data collection",
  ]) {
    assert.match(
      plan,
      new RegExp(escapeRegExp(phrase)),
      `missing scope phrase: ${phrase}`,
    );
  }
  assert.doesNotMatch(
    plan,
    /do not add,\s*ask for,\s*or route around the fallback/i,
    "fallback policy must require user confirmation instead of forbidding the confirmation step",
  );

  for (const phrase of [
    "This plan supersedes it for the UI layer",
    "simple, premium, calm, and business-first",
    "The page must not look like a demo, technical console, acceptance package, or engineering showcase",
    "Games are deliberately simple",
    "`思维训练` and `运动训练`",
    "风险评估辅助",
    "干预训练",
    "数据采集",
    "Do not add fallback, mock, demo",
    "A formal training loop is incomplete until the doctor reviews the training result",
    "Unit 13: Full Regression And Completion Audit",
  ]) {
    assert.match(
      rebuildPlan,
      new RegExp(escapeRegExp(phrase)),
      `missing rebuild scope: ${phrase}`,
    );
  }

  for (const phrase of [
    "Before each unit, dispatch read-only subagents first",
    "simple, premium, role-focused rehabilitation product",
    "This plan supersedes the remaining UI execution work from the 2026-06-08 plan",
    "Do not add fallback, mock, demo",
    "Patient training preparation cannot create a replacement collection batch",
    "Page Action To API Acceptance Map",
    "Unit 0: Freeze New IA And Acceptance Documents",
    "Unit 11: Manual Product Smoke",
  ]) {
    assert.match(
      currentRebuildPlan,
      new RegExp(escapeRegExp(phrase)),
      `missing current rebuild scope: ${phrase}`,
    );
  }

  for (const phrase of [
    "Minimal Premium UI Complete Overhaul Implementation Plan",
    "Superseded by the 2026-06-10 master closure plan",
    "2026-06-10-minimal-premium-ui-master-closure-plan.md",
    "As of 2026-06-10, this file is historical evidence for the reset and early overhaul work",
    "Current execution continues from `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md`",
    "The 2026-06-10 master closure plan is the authoritative execution plan",
    "Push over the current Web UI",
    "minimal, premium, business-first rehabilitation product",
    "Visual Denial Line",
    "Business Logic Closure Gate",
    "No business surface may use size, shadow, gradient, glass, or feature copy to compensate for unclear task flow",
    "A page is not complete until its real role action succeeds through the configured API and the returned persisted state is visible after reload",
    "`训练结果提交失败` is a blocking failure",
    "If any fallback strategy looks necessary, stop that implementation unit and ask the user before adding it",
    "Games do not need to become complex",
    "plan variety, intervention matching, and reliable data collection",
    "Playwright specs previously tolerated result submit failure wording in the formal UI chain",
    "Unit 0 now forbids treating `训练结果提交失败` as success",
    "Assessment/risk review is a hard completion blocker",
    "Unit 3: Session Orchestration And Old UI Cleanup",
    "Doctor `患者 -> 评估 -> 计划 -> 准备 -> 复核` works",
    "login, assessment record, doctor assessment/risk review, plan confirmation, preparation creation, training start, saved result, doctor result review, caregiver summary, audit/export",
    "If subagent infrastructure errors, record the exact tool outage and do not count the subagent-review gate as satisfied until a later review succeeds",
    "Training start must use real `api.startTrainingSession`",
    "Training result submission must use real `api.submitTrainingResult`",
    "Doctor training result review must use real `api.reviewTrainingResult`",
    "Doctor plan confirmation must use real `api.confirmPlan`",
    "Doctor preparation creation must use real `api.createCollectionBatch`",
    "Unit 12: Manual Product Smoke And Completion Audit",
  ]) {
    assert.match(
      completeOverhaulPlan,
      new RegExp(escapeRegExp(phrase)),
      `missing complete overhaul scope: ${phrase}`,
    );
  }

  for (const phrase of [
    "Minimal Premium UI Master Closure Implementation Plan",
    "Single Source Of Execution Truth",
    "Do not execute older UI plans directly",
    "Current Verified State",
    "Open Global Gaps",
    "formal Playwright chain must carry the same IDs",
    "No fallback, mock, demo, fake readiness, fake result, fake success, silent downgrade, or route fulfill may be added without explicit user approval",
    "Completion is impossible until every unit has RED, GREEN, review, and evidence",
  ]) {
    assert.match(
      masterClosurePlan,
      new RegExp(escapeRegExp(phrase)),
      `missing master closure scope: ${phrase}`,
    );
  }

  assert.match(plan, /Superseded for UI execution/);
  assert.match(plan, /2026-06-10-minimal-premium-ui-master-closure-plan\.md/);
  assert.match(plan, /2026-06-09 complete-overhaul plan remains historical evidence/);
  assert.match(rebuildPlan, /Superseded for remaining UI execution/);
  assert.match(rebuildPlan, /2026-06-10-minimal-premium-ui-master-closure-plan\.md/);
  assert.match(currentRebuildPlan, /Superseded for complete UI overhaul execution/);
  assert.match(currentRebuildPlan, /2026-06-10-minimal-premium-ui-master-closure-plan\.md/);

  for (const phrase of [
    "prepareFormalSameIdChain",
    "prepareFormalPlanAndProtocol",
    "collection-batches",
    "确认计划",
    "开始训练准备",
    "patient-prep-flow",
    "patient-prep-start-cta",
    "本次训练已保存",
    "保存复核结论",
    "caregiver-primary-workspace",
    "训练进展",
    "生成脱敏 CSV",
  ]) {
    assert.match(
      formalUiBusinessChain,
      new RegExp(escapeRegExp(phrase)),
      `formal UI chain missing required step: ${phrase}`,
    );
  }
  assert.doesNotMatch(
    formalUiBusinessChain,
    /训练结果提交失败[^;\n)]*\|[^;\n)]*本次训练已(?:保存|完成)|本次训练已(?:保存|完成)[^;\n)]*\|[^;\n)]*训练结果提交失败/,
    "formal UI chain must not accept result-submit failure as a success alternative",
  );
});

test("customer acceptance, UI spec, and role-flow docs use the current rebuild IA", async () => {
  const customerAcceptance = await readFile(
    join(rootDir, "docs/customer-acceptance-criteria.md"),
    "utf8",
  );
  const designSpec = await readFile(
    join(rootDir, "docs/rehab-platform-ui-design-spec.md"),
    "utf8",
  );
  const roleFlows = await readFile(
    join(rootDir, "docs/rehab-platform-role-flows-and-pages.md"),
    "utf8",
  );

  assert.match(
    customerAcceptance,
    /患者端最终入口为 `今日 -> 训练 -> 记录 -> 我的`/,
  );
  assert.match(
    customerAcceptance,
    /家属端最终入口为 `照护 -> 进展 -> 提醒 -> 我的`/,
  );
  assert.match(
    customerAcceptance,
    /管理员端最终入口为 `账号 -> 内容 -> 配置 -> 审计`/,
  );
  assert.match(
    customerAcceptance,
    /医师端最终入口为 `患者 -> 评估 -> 计划 -> 准备 -> 复核`/,
  );
  assert.doesNotMatch(customerAcceptance, /我的 -> 今日 -> 训练 -> 记录/);
  assert.doesNotMatch(customerAcceptance, /照护中心 -> 进展 -> 注意事项 -> 个人资料/);
  assert.doesNotMatch(customerAcceptance, /供应商治理 -> 审计治理 -> 导出治理/);

  assert.match(designSpec, /2026-06-09-minimal-premium-ui-rebuild-plan\.md/);
  assert.match(designSpec, /Minimal Premium Clinical Rebuild/);
  assert.match(designSpec, /2026-06-09-minimal-premium-ui-complete-overhaul-plan\.md/);
  assert.match(designSpec, /2026-06-10-minimal-premium-ui-master-closure-plan\.md/);
  assert.match(designSpec, /Complete Minimal Premium UI Overhaul/);
  assert.match(designSpec, /最终执行以 2026-06-10 master closure 计划为准/);
  assert.match(designSpec, /潜在患病风险测量/);
  assert.match(designSpec, /多方案干预/);
  assert.match(designSpec, /可靠数据采集/);
  assert.match(
    designSpec,
    /简约高级 > 功能展示；业务任务 > 能力说明；克制界面 > 情绪化\/游戏化表达。/,
  );
  assert.match(designSpec, /视觉否决线/);
  assert.match(
    designSpec,
    /常规业务页面使用轻边框和低对比线条建立层次，不使用大卡片、明显投影、玻璃、渐变或营销英雄区/,
  );
  assert.match(
    designSpec,
    /患者端通过任务清晰度、字号和可点击面积提升可用性，不通过大卡片或明显阴影制造高级感/,
  );
  assert.match(
    designSpec,
    /训练结果提交失败不得计为流程成功/,
  );
  assert.match(designSpec, /克制/);
  assert.match(designSpec, /简约高级/);
  assert.match(designSpec, /业务主线优先/);
  assert.doesNotMatch(designSpec, /欢迎页主标题/);
  assert.doesNotMatch(designSpec, /^- 温暖$/m);
  assert.doesNotMatch(designSpec, /Warm Clinical Calm/);
  assert.doesNotMatch(designSpec, /单字段大卡片式布局优先/);
  assert.doesNotMatch(designSpec, /患者端允许更明显但柔和的阴影/);
  assert.doesNotMatch(designSpec, /\|\s*`shadow-2`\s*\|[^\n]*大卡片/);
  assert.doesNotMatch(designSpec, /\|\s*`shadow-3`\s*\|[^\n]*核心结果卡/);
  assert.doesNotMatch(designSpec, /核心结果卡/);
  assert.doesNotMatch(designSpec, /患者端卡片/);
  assert.match(
    roleFlows,
    /训练结果上传失败不得进入记录页成功结果、不得计入完成训练/,
  );
  assert.match(
    roleFlows,
    /待补偿\/待同步不得作为医生复核或正式业务链完成条件/,
  );
  assert.match(
    roleFlows,
    /技术\/运行时\/审计证据只属于管理员和审计员治理页/,
  );
  assert.match(
    roleFlows,
    /最终执行以 `docs\/superpowers\/plans\/2026-06-10-minimal-premium-ui-master-closure-plan\.md` 为准/,
  );
  assert.match(roleFlows, /潜在患病风险测量/);
  assert.match(roleFlows, /多方案干预/);
  assert.match(roleFlows, /可靠数据采集/);
  assert.match(customerAcceptance, /简单游戏/);
  assert.match(customerAcceptance, /多方案干预/);
  assert.match(customerAcceptance, /潜在患病风险测量/);
  assert.match(customerAcceptance, /可靠数据采集/);
  assert.match(customerAcceptance, /思维训练/);
  assert.match(customerAcceptance, /运动训练/);
  assert.match(customerAcceptance, /Complete Minimal Premium UI Overhaul/);
  assert.match(roleFlows, /Complete Minimal Premium UI Overhaul/);
  assert.match(roleFlows, /思维训练/);
  assert.match(roleFlows, /运动训练/);
});

test("role-flow docs state technical details are hidden from patient and caregiver", async () => {
  const source = await readFile(
    join(rootDir, "docs/rehab-platform-role-flows-and-pages.md"),
    "utf8",
  );
  for (const entry of [
    "患者 | `今日 -> 训练 -> 记录 -> 我的`",
    "医师 | `患者 -> 评估 -> 计划 -> 准备 -> 复核`",
    "管理员 | `账号 -> 内容 -> 配置 -> 审计`",
    "家属 | `照护 -> 进展 -> 提醒 -> 我的`",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(entry)), `missing role IA: ${entry}`);
  }
  assert.doesNotMatch(source, /患者队列 -> 评估复核 -> 计划管理 -> 训练复核/);
  assert.doesNotMatch(source, /医师 \| `患者 -> 评估 -> 计划 -> 复核`/);
  assert.doesNotMatch(source, /账号治理 -> 内容治理 -> 配置治理 -> 安全审计/);
  assert.match(source, /患者端文案必须是业务语言/, "missing patient business-language rule");
  assert.match(source, /今日工作区/);
  assert.match(source, /训练工作区/);
  assert.match(source, /记录工作区/);
  assert.match(source, /我的工作区/);
  assert.doesNotMatch(source, /\| P0 \| 康复欢迎页 \|/);
  assert.doesNotMatch(source, /\| P0 \| 评估准备页 \|/);
  assert.doesNotMatch(source, /\| P0 \| AI评估页 \|/);
  assert.doesNotMatch(source, /\| P0 \| 评估结果与康复建议页 \|/);
  assert.match(source, /家属端不承担临床判断/, "missing caregiver clinical-boundary rule");
  assert.match(source, /不展示原始评估 payload/, "missing caregiver raw-payload hiding rule");
  assert.match(
    source,
    /runtime\/provider\/audit evidence/,
    "missing runtime/provider/audit evidence wording",
  );
  assert.match(
    source,
    /administrator\/auditor workflows/,
    "missing administrator/auditor workflow boundary",
  );
  assert.match(
    source,
    /acceptance scripts/,
    "missing acceptance script evidence boundary",
  );
  assert.match(
    source,
    /technical\/runtime\/audit evidence belongs to admin\/auditor workflows only/,
    "missing total rebuild admin/auditor-only evidence boundary",
  );
  const adminFlow = sliceBetween(
    source,
    "### 7.2 管理员端主流程",
    "### 7.3 管理员端异常流程",
  );
  assert.match(adminFlow, /账号/);
  assert.match(adminFlow, /内容/);
  assert.match(adminFlow, /配置/);
  assert.match(adminFlow, /审计/);
  assert.doesNotMatch(adminFlow, /账号治理|内容治理|配置治理|安全审计/);
  assert.doesNotMatch(adminFlow, /运营统计摘要/);
});

test("older delivery plan and UI design spec defer to minimal premium rebuild", async () => {
  const oldPlan = await readFile(
    join(rootDir, "docs/superpowers/plans/2026-06-05-docx-delivery-ui-functional-closure.md"),
    "utf8",
  );
  assert.match(oldPlan, /Superseded for UI execution/);
  assert.match(oldPlan, /2026-06-10-minimal-premium-ui-master-closure-plan\.md/);
  assert.match(oldPlan, /formal delivery capability record/);
  assert.match(oldPlan, /do not use its technical UI surfaces as the target product experience/);

  const designSpec = await readFile(
    join(rootDir, "docs/rehab-platform-ui-design-spec.md"),
    "utf8",
  );
  for (const phrase of [
    "Minimal Premium Clinical",
    "Minimal Premium Clinical Rebuild",
    "简约高级",
    "页面克制",
    "常规业务容器圆角优先控制在 `8px`",
    "不做营销式大卡片堆叠",
    "技术治理内容只进入管理员/审计员界面或验收脚本",
    "登录后直接进入角色工作区",
    "今日工作区",
    "训练工作区",
    "记录工作区",
    "我的工作区",
  ]) {
    assert.match(
      designSpec,
      new RegExp(escapeRegExp(phrase)),
      `missing design spec phrase: ${phrase}`,
    );
  }
  assert.match(designSpec, /\|\s*`radius-sm`\s*\|\s*`4px`\s*\|/);
  assert.match(designSpec, /\|\s*`radius-md`\s*\|\s*`8px`\s*\|/);
  assert.match(designSpec, /\|\s*`radius-lg`\s*\|\s*`8px`\s*\|/);
  assert.doesNotMatch(designSpec, /\|\s*`radius-sm`\s*\|\s*`10px`\s*\|/);
  assert.doesNotMatch(designSpec, /\|\s*`radius-md`\s*\|\s*`16px`\s*\|/);
  assert.doesNotMatch(designSpec, /\|\s*`radius-lg`\s*\|\s*`22px`\s*\|/);
  assert.doesNotMatch(designSpec, /\|\s*`radius-xl`\s*\|\s*`28px`\s*\|/);
  assert.doesNotMatch(designSpec, /圆角：`16px`/);
  assert.doesNotMatch(designSpec, /### 6\.1 康复欢迎页/);
  assert.doesNotMatch(designSpec, /页面目标：\s*\n\s*\n- 建立温暖、安全、可信的第一印象/);
});

test("total rebuild plan keeps out-of-scope social and wearable capabilities gated", async () => {
  const rebuildPlan = await readFile(
    join(rootDir, "docs/superpowers/plans/2026-06-08-minimal-premium-ui-total-rebuild.md"),
    "utf8",
  );

  for (const phrase of [
    "公开社交广场",
    "穿戴设备生理指标采集",
    "must first confirm",
    "visibility, moderation, reporting, blocking, privacy, clinical review, audit, and retention",
    "device model, SDK/API/protocol, sampling rules, thresholds, authorization scope, and field evidence",
  ]) {
    assert.match(
      rebuildPlan,
      new RegExp(escapeRegExp(phrase)),
      `missing out-of-scope gate: ${phrase}`,
    );
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}
