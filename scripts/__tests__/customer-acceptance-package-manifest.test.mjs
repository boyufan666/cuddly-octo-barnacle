import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { validateCustomerAcceptancePackageManifest } from "../verify-customer-acceptance-package-manifest.mjs";

const execFileAsync = promisify(execFile);
const digestA = hashContent(contentFor("customer-production-input.json"));
const digestB = hashContent(
  contentFor("empty-real-loop/acceptance-report.json"),
);
const digestC = hashContent(contentFor("screenshots/patient-consent.png"));
const digestD = hashContent(
  contentFor("screenshots/doctor-patient-detail.png"),
);
const digestE = hashContent(contentFor("screenshots/patient-demo.png"));

function validManifest(overrides = {}) {
  return deepMerge(
    {
      documentVersion: "customer-acceptance-package-manifest/v1",
      package: {
        customerName: "康复中心",
        acceptanceOwner: "张主任",
        acceptedAt: "2026-06-30T10:00:00.000Z",
        environment: "trial",
        targetLaunchDate: "2026-07-15",
        deploymentMode: "public_cloud",
      },
      productionInput: {
        customerInputPath: "customer-production-input.json",
        customerInputSha256: digestA,
        verifiedBy: "验收员甲",
        verifiedAt: "2026-06-30T10:05:00.000Z",
      },
      emptyRealLoop: {
        orchestratorConfigPath: "empty-real-loop/orchestrator.json",
        acceptanceReportPath: "empty-real-loop/acceptance-report.json",
        acceptanceReportSha256: digestB,
      },
      formalAcceptanceChain: {
        requiredForLaunch: true,
        configPath: "formal-chain/formal-acceptance-chain.json",
      },
      ad8CaregiverInterview: {
        requiredForLaunch: true,
        configPath: "assessments/ad8-caregiver-interview.acceptance.json",
      },
      aiSpeechTts: {
        aiRequiredForLaunch: true,
        speechRequiredForLaunch: true,
        ttsRequiredForLaunch: true,
        aiAssessmentAcceptanceConfigPath:
          "ai-speech/ai-assessment.acceptance.json",
        speechTranscriptEvidencePath:
          "ai-speech/speech-transcript.evidence.json",
        speechTranscriptAcceptanceConfigPath:
          "ai-speech/speech-transcript.acceptance.json",
        speechAiAssessmentConfigPath:
          "ai-speech/speech-ai-assessment.acceptance.json",
        ttsEvidencePath: "ai-speech/tts-speech-output.evidence.json",
        ttsAcceptanceConfigPath: "ai-speech/tts-speech-output.acceptance.json",
      },
      unity: {
        requiredForLaunch: true,
        evidencePath: "unity/unity-field.evidence.json",
        artifactPaths: [
          "unity/screenshots/unity-training-ready.png",
          "unity/recordings/unity-training-run.webm",
        ],
      },
      browserPose: {
        requiredForLaunch: true,
        evidencePath: "browser-pose/browser-pose.evidence.json",
        artifactPaths: [
          "browser-pose/screenshots/browser-pose-ready.png",
          "browser-pose/recordings/browser-pose-run.webm",
        ],
      },
      requiredArtifacts: [
        {
          label: "患者登录与知情同意截图",
          path: "screenshots/patient-consent.png",
          sha256: digestC,
          capturedAt: "2026-06-30T10:10:00.000Z",
        },
        {
          label: "医师患者详情截图",
          path: "screenshots/doctor-patient-detail.png",
          sha256: digestD,
          capturedAt: "2026-06-30T10:15:00.000Z",
        },
      ],
      auditEvidence: {
        auditLogExportPath: "exports/audit-log-sample.json",
        desensitizedExportPath: "exports/desensitized-training-export.csv",
        requiredActions: [
          "consent.grant",
          "assessment.create",
          "rehab_plan.confirm",
          "training_session.start",
          "training_result.submit",
          "caregiver.summary.view",
        ],
        checkedAt: "2026-06-30T10:20:00.000Z",
      },
      privacyEvidence: {
        caregiverSummaryDesensitized: true,
        exportDesensitized: true,
        consentWithdrawalBlocked: true,
        rawMediaExcluded: true,
        checkedBy: "审计员甲",
        checkedAt: "2026-06-30T10:25:00.000Z",
      },
      checks: {
        generatedBy: "验收员甲",
        checkedAt: "2026-06-30T10:30:00.000Z",
        toolVersions: {
          customerAcceptancePackageVerifier:
            "customer-acceptance-package-manifest/v1",
        },
      },
    },
    overrides,
  );
}

test("customer acceptance package manifest accepts a complete formal evidence package", async () => {
  const dir = await preparePackage(validManifest());
  const result = validateCustomerAcceptancePackageManifest(validManifest(), {
    packageRoot: dir,
  });

  assert.deepEqual(result.failures, []);
});

test("customer acceptance package manifest rejects missing files and mismatched hashes", async () => {
  const manifest = validManifest({
    productionInput: {
      customerInputSha256: `sha256:${"f".repeat(64)}`,
    },
  });
  const dir = await preparePackage(manifest, {
    skip: new Set([
      "unity/recordings/unity-training-run.webm",
      "exports/desensitized-training-export.csv",
    ]),
  });

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /unity\.artifactPaths\[1\].*不存在/);
  assert.match(failures, /auditEvidence\.desensitizedExportPath.*不存在/);
  assert.match(failures, /productionInput\.customerInputSha256.*不匹配/);
});

test("customer acceptance package manifest requires launch scope evidence paths", async () => {
  const manifest = validManifest({
    aiSpeechTts: {
      aiRequiredForLaunch: true,
      speechRequiredForLaunch: true,
      ttsRequiredForLaunch: true,
      aiAssessmentAcceptanceConfigPath: "",
      speechTranscriptEvidencePath: "",
      speechTranscriptAcceptanceConfigPath: "",
      speechAiAssessmentConfigPath: "",
      ttsEvidencePath: "",
      ttsAcceptanceConfigPath: "",
    },
    unity: {
      requiredForLaunch: true,
      evidencePath: "",
      artifactPaths: [],
    },
    browserPose: {
      requiredForLaunch: true,
      evidencePath: "",
      artifactPaths: [],
    },
  });
  const dir = await mkdtemp(join(tmpdir(), "customer-acceptance-package-"));

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /aiAssessmentAcceptanceConfigPath/);
  assert.match(failures, /speechTranscriptEvidencePath/);
  assert.match(failures, /speechAiAssessmentConfigPath/);
  assert.match(failures, /ttsEvidencePath/);
  assert.match(failures, /unity\.evidencePath/);
  assert.match(failures, /browserPose\.evidencePath/);
});

test("customer acceptance package manifest enforces an explicit allowlist at every object level", async () => {
  const templateSource = await readFile(
    resolve(
      import.meta.dirname,
      "../../docs/templates/customer-acceptance-package-manifest.template.json",
    ),
    "utf8",
  );
  const template = JSON.parse(templateSource);
  const contracts = [
    {
      path: "$",
      select: (manifest) => manifest,
      allowed: [
        "documentVersion",
        "package",
        "productionInput",
        "emptyRealLoop",
        "formalAcceptanceChain",
        "ad8CaregiverInterview",
        "aiSpeechTts",
        "unity",
        "browserPose",
        "requiredArtifacts",
        "auditEvidence",
        "privacyEvidence",
        "checks",
      ],
      unknownField: "readCredentialsPath",
    },
    {
      path: "package",
      select: (manifest) => manifest.package,
      allowed: [
        "customerName",
        "acceptanceOwner",
        "acceptedAt",
        "environment",
        "targetLaunchDate",
        "deploymentMode",
      ],
    },
    {
      path: "productionInput",
      select: (manifest) => manifest.productionInput,
      allowed: [
        "customerInputPath",
        "customerInputSha256",
        "verifiedBy",
        "verifiedAt",
      ],
    },
    {
      path: "emptyRealLoop",
      select: (manifest) => manifest.emptyRealLoop,
      allowed: [
        "orchestratorConfigPath",
        "acceptanceReportPath",
        "acceptanceReportSha256",
      ],
    },
    {
      path: "formalAcceptanceChain",
      select: (manifest) => manifest.formalAcceptanceChain,
      allowed: ["requiredForLaunch", "configPath"],
    },
    {
      path: "ad8CaregiverInterview",
      select: (manifest) => manifest.ad8CaregiverInterview,
      allowed: ["requiredForLaunch", "configPath"],
    },
    {
      path: "aiSpeechTts",
      select: (manifest) => manifest.aiSpeechTts,
      allowed: [
        "aiRequiredForLaunch",
        "speechRequiredForLaunch",
        "ttsRequiredForLaunch",
        "aiAssessmentAcceptanceConfigPath",
        "speechTranscriptEvidencePath",
        "speechTranscriptAcceptanceConfigPath",
        "speechAiAssessmentConfigPath",
        "ttsEvidencePath",
        "ttsAcceptanceConfigPath",
      ],
    },
    {
      path: "unity",
      select: (manifest) => manifest.unity,
      allowed: ["requiredForLaunch", "evidencePath", "artifactPaths"],
      unknownField: "patientReadTokenRef",
    },
    {
      path: "browserPose",
      select: (manifest) => manifest.browserPose,
      allowed: ["requiredForLaunch", "evidencePath", "artifactPaths"],
      unknownField: "auditReadTokenRef",
    },
    {
      path: "requiredArtifacts[0]",
      select: (manifest) => manifest.requiredArtifacts[0],
      allowed: ["label", "path", "sha256", "capturedAt"],
    },
    {
      path: "auditEvidence",
      select: (manifest) => manifest.auditEvidence,
      allowed: [
        "auditLogExportPath",
        "desensitizedExportPath",
        "requiredActions",
        "checkedAt",
      ],
    },
    {
      path: "privacyEvidence",
      select: (manifest) => manifest.privacyEvidence,
      allowed: [
        "caregiverSummaryDesensitized",
        "exportDesensitized",
        "consentWithdrawalBlocked",
        "rawMediaExcluded",
        "checkedBy",
        "checkedAt",
      ],
    },
    {
      path: "checks",
      select: (manifest) => manifest.checks,
      allowed: ["generatedBy", "checkedAt", "toolVersions"],
    },
    {
      path: "checks.toolVersions",
      select: (manifest) => manifest.checks.toolVersions,
      allowed: ["customerAcceptancePackageVerifier"],
    },
  ];
  const dir = await preparePackage(validManifest());

  for (const contract of contracts) {
    assert.deepEqual(
      Object.keys(contract.select(template)).sort(),
      [...contract.allowed].sort(),
      `${contract.path} template keys must equal its explicit allowlist`,
    );

    const manifest = structuredClone(validManifest());
    const unknownField = contract.unknownField ?? "unexpectedCredentialRef";
    contract.select(manifest)[unknownField] =
      "secret-manager://rehab/acceptance/unknown";
    const result = validateCustomerAcceptancePackageManifest(manifest, {
      packageRoot: dir,
    });

    assert.match(
      result.failures.join("\n"),
      new RegExp(
        `${escapeRegExp(contract.path)}\\.${unknownField}.*不支持的 manifest 字段`,
      ),
      `${contract.path}.${unknownField} must be rejected even when it is a secret-manager ref`,
    );
  }
});

test("customer acceptance package manifest accepts abilities outside launch scope without evidence paths", async () => {
  const manifest = validManifest({
    aiSpeechTts: {
      aiRequiredForLaunch: false,
      speechRequiredForLaunch: false,
      ttsRequiredForLaunch: false,
    },
    unity: {
      requiredForLaunch: false,
    },
    browserPose: {
      requiredForLaunch: false,
    },
    formalAcceptanceChain: {
      requiredForLaunch: false,
    },
    ad8CaregiverInterview: {
      requiredForLaunch: false,
    },
  });
  const dir = await preparePackage(manifest);

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });

  assert.deepEqual(result.failures, []);
});

test("customer acceptance package manifest rejects placeholders, unsafe markers, and sensitive payload keys", async () => {
  const manifest = validManifest({
    package: {
      customerName: "<customer-name>",
    },
    requiredArtifacts: [
      {
        label: "患者授权截图",
        path: "screenshots/patient-demo.png",
        sha256: digestE,
        capturedAt: "2026-06-30T10:10:00.000Z",
      },
    ],
    providerEvidence: {
      requestBody: {
        authorization: "Bearer raw-secret-token-1234567890",
      },
    },
  });
  const dir = await preparePackage(manifest);

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /占位符/);
  assert.match(failures, /mock\/demo\/seed\/fallback\/fixed\/manual\/local/);
  assert.match(failures, /敏感字段或原始载荷/);
  assert.doesNotMatch(failures, /raw-secret-token-1234567890/);
});

test("customer acceptance package manifest rejects raw transcripts audio and motion payload fields", async () => {
  const manifest = validManifest({
    fieldEvidence: {
      fullTranscript: "患者完整原始问答转写不应进入验收包 manifest。",
      rawProviderPayload: {
        requestId: "provider-call-001",
        responseBody: { text: "原始供应商响应" },
      },
      rawMotionPayload: {
        landmarks: [{ x: 0.1, y: 0.2, visibility: 0.99 }],
      },
      audioBase64:
        "UklGRkFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFB",
    },
  });
  const dir = await preparePackage(manifest);

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });
  const failures = result.failures.join("\n");

  assert.match(failures, /fieldEvidence\.fullTranscript.*敏感字段或原始载荷/);
  assert.match(
    failures,
    /fieldEvidence\.rawProviderPayload.*敏感字段或原始载荷/,
  );
  assert.match(failures, /fieldEvidence\.rawMotionPayload.*敏感字段或原始载荷/);
  assert.match(failures, /fieldEvidence\.audioBase64.*敏感字段或原始载荷/);
  assert.doesNotMatch(failures, /患者完整原始问答转写/);
  assert.doesNotMatch(failures, /原始供应商响应/);
});

test("customer acceptance package manifest rejects empty referenced evidence files", async () => {
  const manifest = validManifest();
  const dir = await preparePackage(manifest);
  await writeFile(join(dir, "screenshots/patient-consent.png"), "");

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });

  assert.match(
    result.failures.join("\n"),
    /requiredArtifacts\[0\]\.path 指向的文件不能为空/,
  );
});

test("customer acceptance package manifest rejects paths outside the package root", async () => {
  const manifest = validManifest({
    requiredArtifacts: [
      {
        label: "越界文件",
        path: "../outside.png",
        sha256: digestE,
        capturedAt: "2026-06-30T10:10:00.000Z",
      },
    ],
  });
  const dir = await preparePackage(validManifest());

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });

  assert.match(
    result.failures.join("\n"),
    /requiredArtifacts\[0\]\.path.*包目录内/,
  );
});

test("customer acceptance package manifest rejects minimal or inconsistent PASSED reports", async () => {
  for (const report of [
    {
      documentVersion: "empty-real-loop-acceptance-report/v1",
      status: "PASSED",
    },
    {
      ...validReport(),
      summary: { ...validReport().summary, passedSteps: 0 },
    },
  ]) {
    const content = JSON.stringify(report, null, 2);
    const manifest = validManifest({
      emptyRealLoop: { acceptanceReportSha256: hashContent(content) },
    });
    const dir = await preparePackage(manifest);
    await writeFile(
      join(dir, manifest.emptyRealLoop.acceptanceReportPath),
      content,
    );
    const result = validateCustomerAcceptancePackageManifest(manifest, {
      packageRoot: dir,
    });
    assert.match(
      result.failures.join("\n"),
      /acceptance|summary|steps|failures/,
    );
  }
});

test("customer acceptance package manifest rejects symlinks escaping the package root", async () => {
  const manifest = validManifest();
  const dir = await preparePackage(manifest, {
    skip: new Set([manifest.productionInput.customerInputPath]),
  });
  const outsideDir = await mkdtemp(
    join(tmpdir(), "acceptance-package-outside-"),
  );
  const outsidePath = join(outsideDir, "customer-production-input.json");
  await writeFile(outsidePath, contentFor("customer-production-input.json"));
  await symlink(
    outsidePath,
    join(dir, manifest.productionInput.customerInputPath),
  );

  const result = validateCustomerAcceptancePackageManifest(manifest, {
    packageRoot: dir,
  });
  assert.match(result.failures.join("\n"), /真实路径必须位于客户验收包目录内/);
});

test("customer acceptance package manifest CLI verifies an explicit package root", async () => {
  const manifest = validManifest();
  const dir = await preparePackage(manifest);
  const manifestPath = join(dir, "customer-acceptance-package-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const { stdout } = await execFileAsync("node", [
    "scripts/verify-customer-acceptance-package-manifest.mjs",
    manifestPath,
    "--package-root",
    dir,
  ]);

  assert.match(stdout, /客户验收包 manifest 校验通过/);
});

test("customer acceptance package manifest CLI rejects missing package root value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "customer-acceptance-package-cli-"));
  const manifestPath = join(dir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(validManifest(), null, 2));

  await assert.rejects(
    () =>
      execFileAsync("node", [
        "scripts/verify-customer-acceptance-package-manifest.mjs",
        manifestPath,
        "--package-root",
      ]),
    (error) => {
      assert.match(error.stderr, /--package-root 必须提供客户验收包根目录/);
      return true;
    },
  );
});

function deepMerge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides))
    return overrides ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = deepMerge(base[key], value);
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function preparePackage(manifest, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "customer-acceptance-package-"));
  const paths = collectManifestPaths(manifest);
  for (const path of paths) {
    if (options.skip?.has(path)) continue;
    await writePackageFile(dir, path, contentFor(path));
  }
  return dir;
}

function collectManifestPaths(manifest) {
  const paths = [
    manifest.productionInput?.customerInputPath,
    manifest.emptyRealLoop?.orchestratorConfigPath,
    manifest.emptyRealLoop?.acceptanceReportPath,
    manifest.formalAcceptanceChain?.requiredForLaunch
      ? manifest.formalAcceptanceChain.configPath
      : null,
    manifest.ad8CaregiverInterview?.requiredForLaunch
      ? manifest.ad8CaregiverInterview.configPath
      : null,
    manifest.aiSpeechTts?.aiRequiredForLaunch
      ? manifest.aiSpeechTts.aiAssessmentAcceptanceConfigPath
      : null,
    manifest.aiSpeechTts?.speechRequiredForLaunch
      ? manifest.aiSpeechTts.speechTranscriptEvidencePath
      : null,
    manifest.aiSpeechTts?.speechRequiredForLaunch
      ? manifest.aiSpeechTts.speechTranscriptAcceptanceConfigPath
      : null,
    manifest.aiSpeechTts?.speechRequiredForLaunch
      ? manifest.aiSpeechTts.speechAiAssessmentConfigPath
      : null,
    manifest.aiSpeechTts?.ttsRequiredForLaunch
      ? manifest.aiSpeechTts.ttsEvidencePath
      : null,
    manifest.aiSpeechTts?.ttsRequiredForLaunch
      ? manifest.aiSpeechTts.ttsAcceptanceConfigPath
      : null,
    manifest.unity?.requiredForLaunch ? manifest.unity.evidencePath : null,
    ...(manifest.unity?.requiredForLaunch
      ? (manifest.unity.artifactPaths ?? [])
      : []),
    manifest.browserPose?.requiredForLaunch
      ? manifest.browserPose.evidencePath
      : null,
    ...(manifest.browserPose?.requiredForLaunch
      ? (manifest.browserPose.artifactPaths ?? [])
      : []),
    ...(manifest.requiredArtifacts ?? []).map((artifact) => artifact.path),
    manifest.auditEvidence?.auditLogExportPath,
    manifest.auditEvidence?.desensitizedExportPath,
  ];
  return paths.filter((path) => typeof path === "string" && path.trim());
}

async function writePackageFile(root, path, content) {
  const absolutePath = join(root, path);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content);
}

function contentFor(path) {
  const content = `formal acceptance artifact: ${path}\n`;
  if (path === "customer-production-input.json") {
    return "different customer input content\n";
  }
  if (path === "empty-real-loop/acceptance-report.json") {
    return reportContent();
  }
  return content;
}

function reportContent() {
  return JSON.stringify(validReport(), null, 2);
}

function validReport() {
  return {
    documentVersion: "empty-real-loop-acceptance-report/v1",
    status: "PASSED",
    acceptance: {
      customerName: "康复中心",
      acceptedAt: "2026-06-30T09:00:00.000Z",
      testerName: "验收员甲",
      environment: "trial",
    },
    startedAt: "2026-06-30T09:00:00.000Z",
    finishedAt: "2026-06-30T09:01:00.000Z",
    summary: {
      totalSteps: 1,
      passedSteps: 1,
      blockedSteps: 0,
      notRunSteps: 0,
      blockedStepLabel: null,
    },
    steps: [
      {
        index: 1,
        label: "正式验收步骤",
        commandName: "verify:contracts",
        status: "PASSED",
        exitCode: 0,
        startedAt: "2026-06-30T09:00:00.000Z",
        endedAt: "2026-06-30T09:01:00.000Z",
      },
    ],
    failures: [],
  };
}

function hashContent(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

test("hash helper sanity check keeps report digest available to tests", () => {
  assert.match(hashContent(reportContent()), /^sha256:[a-f0-9]{64}$/);
});
