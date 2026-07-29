import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const forbidden =
  /engine:|license:|sensing:|MediaPipe|Phaser|Unity loader|manifest|bridge|runtimeType|provider|Provider|供应商|Endpoint|audit ID|auditId|审计\s*ID|审计\s*Id|raw evidence|raw payload|provider payload|quality evidence|质量证据|acceptance package|secret reference|资源清单|证据链|审计|导出治理|技术验收|验收包|采集|动作识别|fallback|mock|demo/i;

const patientVisibleFeaturePaths = [
  "apps/web/src/features/patient/PatientWorkspacePage.tsx",
  "apps/web/src/features/patient/TodayTrainingPage.tsx",
  "apps/web/src/features/patient/TrainingPrepChecklist.tsx",
  "apps/web/src/features/patient/TrainingRuntimePage.tsx",
  "apps/web/src/features/patient/TrainingResultPage.tsx",
  "apps/web/src/features/patient/PatientProfilePage.tsx",
  "apps/web/src/features/patient/GameLibraryPage.tsx",
  "apps/web/src/features/patient/AssessmentDialoguePage.tsx",
  "apps/web/src/features/patient/DevicePermissionCenterPage.tsx",
  "apps/web/src/features/patient/PlanSuggestionPage.tsx",
  "apps/web/src/features/patient/TrainingTaskPicker.tsx",
  "apps/web/src/features/patient/PatientHomeNav.tsx",
  "apps/web/src/features/patient/plan-suggestion-model.ts",
];

const patientVisibleRuntimePaths = [
  "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
  "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
];

test("patient and caregiver feature modules do not expose technical copy", async () => {
  for (const path of patientVisibleFeaturePaths) {
    const source = await readFile(join(rootDir, path), "utf8");
    assert.doesNotMatch(
      source,
      forbidden,
      `patient-visible feature leaks technical copy: ${path}`,
    );
  }

  const assessmentDialogueSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/AssessmentDialoguePage.tsx"),
    "utf8",
  );
  const workspaceSource = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const caregiverPaths = await listCaregiverFeaturePaths();
  assert.ok(
    caregiverPaths.length > 0,
    "caregiver-visible feature modules should exist after caregiver workspace extraction",
  );

  for (const path of caregiverPaths) {
    const source = await readFile(join(rootDir, path), "utf8");
    assert.doesNotMatch(
      source,
      forbidden,
      `caregiver-visible feature leaks technical copy: ${path}`,
    );
  }

  assert.doesNotMatch(
    workspaceSource,
    /function FamilyScreen|function FamilyBinding/,
    "caregiver visible workspace should be extracted out of role-workspace.tsx",
  );
  assert.doesNotMatch(
    patientVisibleWorkspaceCopy(assessmentDialogueSource),
    /采集/,
    "patient-reachable role workspace copy should not expose collection wording",
  );
});

test("patient result action validation does not expose internal result fields in messages", async () => {
  const source = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/patient-training-result-boundary.ts",
    ),
    "utf8",
  );
  const visibleMessages = visibleStringLiterals(source);

  assert.match(source, /validateCapturedPatientTrainingResult/);
  assert.doesNotMatch(
    visibleMessages,
    /训练运行摘要|结果来源|运行批次|游戏版本|数据版本|数据指纹|原始摘要|rawPayload|rawSummary|runtimeType|collectionBatchId|protocolVersion|gameRunId/i,
  );
  assert.doesNotMatch(
    visibleMessages,
    /动作识别|指标明细|采样|置信度/,
    "patient result validation should not expose internal metric wording",
  );
  assert.match(visibleMessages, /训练结果信息不完整，请重新完成本次训练。/);
});

test("patient-rendered readiness blockers do not expose collection wording", async () => {
  const planSuggestionModelSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/plan-suggestion-model.ts"),
    "utf8",
  );
  const formalReadinessSource = await readFile(
    join(rootDir, "apps/web/src/lib/formal-training-content-readiness.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    visibleStringLiterals(planSuggestionModelSource),
    /采集/,
    "plan prerequisite labels and blockers render in patient-facing plan suggestions",
  );
  assert.doesNotMatch(
    visibleStringLiterals(
      extractFunctionBlock(
        formalReadinessSource,
        "resolveFormalRuntimeCameraConfiguration",
      ),
    ),
    /采集/,
    "runtime camera readiness errors can surface in patient training preparation",
  );
});

test("patient-visible runtime markup does not expose adapter or raw vision copy", async () => {
  const gameplayLibrarySource = await readFile(
    join(rootDir, "apps/web/src/lib/browser-pose-game-library.ts"),
    "utf8",
  );
  const gameplayRulesSource = await readFile(
    join(rootDir, "apps/web/src/lib/browser-pose-gameplay-rules.ts"),
    "utf8",
  );
  for (const path of patientVisibleRuntimePaths) {
    const source = await readFile(join(rootDir, path), "utf8");
    const visibleJsx = patientVisibleJsx(source, path);
    const visibleMarkup = visibleJsxTextAndLiteralProps(visibleJsx);
    assert.doesNotMatch(
      visibleMarkup,
      forbidden,
      `patient-visible runtime markup leaks technical copy: ${path}`,
    );
    assert.doesNotMatch(
      visibleMarkup,
      /关键点|置信度|采样帧|资源清单|协议版本|体感训练状态|debug|adapter|local|dev/i,
      `patient-visible runtime markup leaks raw runtime copy: ${path}`,
    );
    assert.doesNotMatch(
      visibleJsx,
      /rounded-2xl|rounded-3xl|rounded-\[(?:2[0-9]|3[0-9])px\]|backdrop-blur|bg-\[#|text-\[#|border-\[#|bg-white\/|border-white\/|text-white\/|font-mono|radial-gradient|linear-gradient/i,
      `patient-visible runtime markup should use the shared minimal token system: ${path}`,
    );
    assert.match(
      visibleJsx,
      /training-stage-shell/,
      `patient-visible runtime surface should declare a stable training-stage-shell: ${path}`,
    );
    if (path.endsWith("BrowserPoseTrainingSurface.tsx")) {
      const statsDisplayCopy = visibleStringLiterals(
        extractFunctionBlock(source, "resolveBrowserPoseGameplayStatsDisplay"),
      );
      const qualityCopy = visibleStringLiterals(
        extractFunctionBlock(source, "resolveBrowserPoseQualityReasons"),
      );
      const dynamicGameplayCopy = visibleRuntimeGameplayProfileStrings(
        gameplayLibrarySource,
      );
      const dynamicTargetCopy = visibleStringLiterals(
        extractFunctionBlock(
          gameplayRulesSource,
          "buildBrowserPoseTargetGameplayLabel",
        ),
      );
      assert.doesNotMatch(
        statsDisplayCopy,
        forbidden,
        `patient-visible gameplay stats copy leaks technical copy: ${path}`,
      );
      assert.doesNotMatch(
        statsDisplayCopy,
        /稳定窗口|当前保持|协同窗口|偏移\/方向|平均反应|判断速度|偏离次数|触达\/漏触|采样帧|资源清单|协议版本|体感训练状态|debug|adapter|local|dev/i,
        `patient-visible gameplay stats copy leaks raw runtime copy: ${path}`,
      );
      for (const copySource of [
        ["quality copy", qualityCopy],
        ["dynamic profile copy", dynamicGameplayCopy],
        ["dynamic target copy", dynamicTargetCopy],
      ]) {
        assert.doesNotMatch(
          copySource[1],
          /系统重点记录|有效动作窗口|稳定保持窗口|双手协同窗口|轨迹追踪窗口|重心转移窗口|有效触达动作|稳定窗口|当前保持|协同窗口|偏移\/方向|平均反应|判断速度|偏离次数|触达\/漏触|检查点进度|触达准确度|同步差|毫秒|证据|采样帧|资源清单|协议版本|体感训练状态|debug|adapter|local|dev/i,
          `patient-visible ${copySource[0]} leaks raw runtime copy: ${path}`,
        );
      }
      assert.doesNotMatch(
        visibleJsx,
        /sampleCount|validFrameCount|averageVisibility|poseModelVersion|poseLandmarkCount|poseAverageVisibility/,
        `patient-visible runtime markup should not render raw pose quality fields: ${path}`,
      );
    } else if (path.endsWith("UnityTrainingSurface.tsx")) {
      const manifestMessageAssignments = Array.from(
        source.matchAll(
          /setManifestState\(\{\s*state:\s*"error",\s*message:\s*([^}]+)\}/g,
        ),
        ([, messageExpression]) => messageExpression,
      ).join("\n");
      assert.match(
        source,
        /function patientTrainingUnavailableMessage/,
        "Unity training surface should route patient-visible error copy through a safe message helper",
      );
      assert.doesNotMatch(
        manifestMessageAssignments,
        /error\.message|String\(|Unity|manifest|runtime|资源清单|协议版本|bridge/i,
        "patient-visible Unity error state must not render implementation errors directly",
      );
    }
  }
});

async function listCaregiverFeaturePaths() {
  const caregiverDir = join(rootDir, "apps/web/src/features/caregiver");
  return listSourceFiles(caregiverDir, "apps/web/src/features/caregiver");
}

async function listSourceFiles(absoluteDir, relativeDir) {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(absoluteDir, entry.name);
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        return listSourceFiles(absolutePath, relativePath);
      }
      if (
        entry.isFile() &&
        /\.(tsx|ts)$/.test(entry.name) &&
        !/\.(test|spec)\.(tsx|ts)$/.test(entry.name)
      ) {
        return [relativePath];
      }
      return [];
    }),
  );
  return paths.flat();
}

function sliceBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing ${label} start marker: ${startMarker}`);
  const end =
    typeof endMarker === "string"
      ? source.indexOf(endMarker, start)
      : start + source.slice(start).search(endMarker);
  assert.notEqual(end, -1, `Missing ${label} end marker: ${endMarker}`);
  return source.slice(start, end);
}

function patientVisibleJsx(source, path) {
  if (path.endsWith("BrowserPoseTrainingSurface.tsx")) {
    return sliceFrom(
      extractFunctionBlock(source, "BrowserPoseTrainingSurface"),
      "return (\n    <div",
    );
  }
  if (path.endsWith("UnityTrainingSurface.tsx")) {
    return sliceFrom(
      extractFunctionBlock(source, "UnityTrainingSurface"),
      "return (\n    <div",
    );
  }
  throw new Error(`No visible JSX extractor for ${path}`);
}

function extractFunctionBlock(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${functionName}`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      opened = true;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (opened && depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unterminated function ${functionName}`);
}

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  return source.slice(start);
}

function visibleJsxTextAndLiteralProps(source) {
  const textNodes = Array.from(source.matchAll(/>([^<>{}]+)</g), ([, text]) =>
    text.trim(),
  ).filter(Boolean);
  const literalProps = Array.from(
    source.matchAll(
      /\b(?:label|title|description|aria-label)=["']([^"']+)["']/g,
    ),
    ([, text]) => text.trim(),
  ).filter(Boolean);
  const literalBranches = Array.from(
    source.matchAll(/:\s*["']([^"']+)["']/g),
    ([, text]) => text.trim(),
  ).filter(Boolean);
  return [...textNodes, ...literalProps, ...literalBranches].join("\n");
}

function visibleStringLiterals(source) {
  return Array.from(
    source.matchAll(/["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g),
    ([, text]) => text.trim(),
  )
    .filter(Boolean)
    .join("\n");
}

function visibleRuntimeGameplayProfileStrings(source) {
  const profileBlock = sliceBetween(
    source,
    "const gameplayProfiles = {",
    /\}\s+as const satisfies Record<\s*BrowserPoseScoringProfile,\s*BrowserPoseGameplayProfile\s*>;/,
    "browser pose gameplay profiles",
  );
  return Array.from(
    profileBlock.matchAll(
      /\b(?:targetPrefix|stagePrompt|scoringHint|liveStatLabels):\s*(?:"([^"]*)"|\{([\s\S]*?)\})/g,
    ),
    ([, text, nested]) => text ?? nested ?? "",
  )
    .flatMap((text) =>
      Array.from(
        text.matchAll(/["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g),
        ([, literal]) => literal.trim(),
      ),
    )
    .filter(Boolean)
    .join("\n");
}

function patientVisibleWorkspaceCopy(source) {
  const slices = [
    sliceBetween(
      source,
      "function AssessmentScreen",
      "type AssessmentDialoguePageProps",
      "assessment screen",
    ),
    sliceBetween(
      source,
      "function AiConversationPanel",
      "function AiConversationMessageBubble",
      "ai conversation panel",
    ),
  ];
  return visibleJsxTextAndLiteralProps(slices.join("\n"));
}
