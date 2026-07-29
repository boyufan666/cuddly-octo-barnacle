"use client";

import { ClipboardCheck, FileText, Gamepad2, LockKeyhole } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  buildBrowserPoseEvidence,
  buildBrowserPoseEvidenceChecklist,
  normalizeBrowserPoseEvidenceMotionMetrics,
  type BrowserPoseEvidenceChecklist,
  type BrowserPoseEvidenceInput,
} from "@/lib/browser-pose-evidence";
import { readBrowserPoseCameraMetadata } from "@/lib/browser-pose-camera-metadata";
import {
  buildBrowserPoseEvidencePrefill,
  type BrowserPoseEvidencePrefillForm,
} from "@/lib/browser-pose-evidence-prefill";
import {
  buildTrainingAuditAcceptanceRequiredActions,
  buildTrainingAuditAcceptanceSummary,
  type TrainingAuditAcceptanceSummary,
} from "@/lib/training-audit-acceptance";
import { buildUnityFieldEvidenceInputFromRecord, type UnityFieldEvidenceInput } from "@/lib/unity-field-evidence";
import { cn } from "@/lib/utils";
import type { AuditLog, PatientProfile, RehabPlan, TrainingRecordsResponse } from "@/types/api";
import { isPlainObject, readRequiredFiniteNumber, readRequiredText } from "@/features/training-runtime/runtime-context";
import type { TrainingReadiness } from "@/features/training-runtime/types";

export type BrowserPoseEvidenceFormState = BrowserPoseEvidencePrefillForm;

export type UnityFieldEvidenceFormState = BrowserPoseEvidenceFormState & {
  deviceType: string;
  inputMode: string;
  deviceResolution: string;
  loaderLoadedAt: string;
  unityInstanceStartedAt: string;
  canvasResolution: string;
  devicePixelRatio: string;
};

type StatusTone = "info" | "success" | "warning" | "danger" | "muted";

function buildUnityBridgeEvidenceFromResult(
  session: TrainingRecordsResponse["sessions"][number],
  result: NonNullable<TrainingRecordsResponse["sessions"][number]["result"]>,
):
  | { ok: true; value: UnityFieldEvidenceInput["bridgeEvent"] }
  | { ok: false; error: string } {
  if (!isPlainObject(result.metricsSummary)) {
    return {
      ok: false,
      error: "Unity 训练结果缺少 metricsSummary，不能还原桥接事件摘要。",
    };
  }

  try {
    const sessionId = session.id;
    const gameRunId = readRequiredText(
      result.metricsSummary.gameRunId,
      "Unity 训练结果摘要缺少 gameRunId。",
    );
    const gameVersion = readRequiredText(
      result.metricsSummary.gameVersion,
      "Unity 训练结果摘要缺少 gameVersion。",
    );
    const protocolVersion = readRequiredText(
      result.metricsSummary.protocolVersion,
      "Unity 训练结果摘要缺少 protocolVersion。",
    );
    const resultContractVersion = readRequiredText(
      result.metricsSummary.resultContractVersion,
      "Unity 训练结果摘要缺少 resultContractVersion。",
    );
    const collectionBatchId = readRequiredText(
      result.metricsSummary.collectionBatchId,
      "Unity 训练结果摘要缺少 collectionBatchId。",
    );
    const clientGeneratedAt = readRequiredText(
      result.metricsSummary.clientGeneratedAt,
      "Unity 训练结果摘要缺少 clientGeneratedAt。",
    );
    const rawPayloadHash = readRequiredText(
      result.metricsSummary.rawPayloadHash,
      "Unity 训练结果摘要缺少 rawPayloadHash。",
    );

    return {
      ok: true,
      value: {
        type: "training_result",
        action: "training_result",
        protocolVersion,
        resultContractVersion,
        sessionId,
        collectionBatchId,
        gameRunId,
        gameVersion,
        clientGeneratedAt,
        rawPayloadHash,
        durationSeconds: result.durationSeconds,
        metricsSummary: result.metricsSummary,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unity 桥接事件摘要无效。",
    };
  }
}

function BrowserPoseEvidencePanel({
  patient,
  currentPlan,
  session,
  auditSummary,
  readiness,
  form,
  onFormChange,
  onFormPrefill,
}: {
  patient?: PatientProfile;
  currentPlan?: RehabPlan | null;
  session: TrainingRecordsResponse["sessions"][number];
  auditSummary: TrainingAuditAcceptanceSummary | null;
  readiness: TrainingReadiness;
  form: BrowserPoseEvidenceFormState;
  onFormChange: (
    field: keyof BrowserPoseEvidenceFormState,
    value: string,
  ) => void;
  onFormPrefill: (prefill: Partial<BrowserPoseEvidenceFormState>) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const result = session.result;
  const planItem = currentPlan?.items.find((item) => item.id === session.planItemId);
  const browserRuntimeReady =
    readiness.poseRuntimeStatus === "ready" &&
    Boolean(readiness.poseModelVersion) &&
    Boolean(readiness.poseLandmarkCount) &&
    readiness.poseAverageVisibility !== undefined &&
    Boolean(readiness.poseCheckedAt);
  const evidenceInput =
    patient && currentPlan && planItem && result && browserRuntimeReady
      ? buildBrowserPoseEvidenceInput({
          form,
          patient,
          currentPlan,
          planItem,
          session,
          result,
          readiness,
          auditSummary,
        })
      : null;
  const checklist = evidenceInput
    ? buildBrowserPoseEvidenceChecklist(evidenceInput)
    : null;

  function handleDownload() {
    setMessage(null);
    if (!patient || !currentPlan || !planItem || !result) {
      setMessage("缺少患者、当前方案、方案项目或训练结果，不能导出实机证据。");
      return;
    }
    if (!browserRuntimeReady) {
      setMessage("缺少姿态识别就绪记录，请先在训练准备页完成摄像头和姿态检测。");
      return;
    }
    const requiredActions = buildTrainingAuditAcceptanceRequiredActions(session);
    if (requiredActions.includes("training_result.review")) {
      setMessage(
        "该训练结果属于异常或低质量复核链路，不能作为训练质控样本。请使用有效且无异常的训练结果导出质控记录，并完成训练复核审计。",
      );
      return;
    }

    if (!evidenceInput) {
      setMessage("质控材料尚未就绪，请根据完整性检查补齐现场材料。");
      return;
    }
    const evidenceResult = buildBrowserPoseEvidence(evidenceInput);

    if (!evidenceResult.ok) {
      setMessage(evidenceResult.error);
      return;
    }

    downloadJsonFile(
      evidenceResult.evidence,
      `browser-pose-evidence-${session.id}.json`,
    );
    setMessage(
      [
        "训练质控记录已生成。请将文件、截图和录屏放入同一资料目录，并按机构归档要求完成材料复核。",
      ].join("\n"),
    );
  }

  async function handlePrefillRuntimeEvidence() {
    setMessage(null);
    if (!readiness.cameraDeviceId) {
      setMessage("请先在训练准备页完成摄像头检测，拿到真实摄像头设备 ID 后再读取证据字段。");
      return;
    }

    setIsPrefilling(true);
    try {
      const cameraMetadata = await readBrowserPoseCameraMetadata(
        readiness.cameraDeviceId,
      );
      const prefill = await buildBrowserPoseEvidencePrefill(form, readiness, {
        nowIso: new Date().toISOString(),
        userAgent: navigator.userAgent,
        cameraDeviceId: cameraMetadata.cameraDeviceId,
        videoWidth: cameraMetadata.videoWidth,
        videoHeight: cameraMetadata.videoHeight,
      });
      const entries = Object.entries(prefill) as Array<
        [keyof BrowserPoseEvidenceFormState, string]
      >;

      onFormPrefill(prefill);
      setMessage(
        entries.length > 0
          ? "已读取浏览器与摄像头信息；只会写入当前仍为空的字段，质控人员、质控时间、审计、截图、录屏和医师确认仍需显式提供。"
          : "未读取到可新增的浏览器或摄像头信息，本次没有覆盖任何现有字段。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取浏览器与摄像头信息失败。");
    } finally {
      setIsPrefilling(false);
    }
  }

  return (
    <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="训练质控材料" icon={FileText} />
          <h4 className="mt-3 text-2xl font-black text-[var(--ink-strong)]">
            导出训练质控记录
          </h4>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            仅在训练结果已入库后生成材料。质控人员、审计日志和截图录屏必须显式填写，系统不会自动补造缺失材料。
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Chip tone={browserRuntimeReady ? "success" : "warning"}>
            {browserRuntimeReady ? "姿态记录已就绪" : "缺姿态就绪记录"}
          </Chip>
          <PrimaryButton
            className="min-h-12 bg-[var(--ink-strong)] px-5 text-base hover:bg-[var(--accent-strong)]"
            disabled={isPrefilling}
            onClick={() => {
              void handlePrefillRuntimeEvidence();
            }}
            type="button"
          >
            {isPrefilling ? "读取中" : "读取设备信息"}
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <FieldLine
          label="验收时间"
          value={form.acceptedAt}
          onChange={(value) => onFormChange("acceptedAt", value)}
        />
        <FieldLine
          label="验收人员"
          value={form.testerName}
          onChange={(value) => onFormChange("testerName", value)}
        />
        <FieldLine
          label="验收现场"
          value={form.siteName}
          onChange={(value) => onFormChange("siteName", value)}
        />
        <FieldLine
          label="环境标识"
          value={form.environment}
          onChange={(value) => onFormChange("environment", value)}
        />
        <FieldLine
          label="浏览器名称"
          value={form.browserName}
          onChange={(value) => onFormChange("browserName", value)}
        />
        <FieldLine
          label="浏览器版本"
          value={form.browserVersion}
          onChange={(value) => onFormChange("browserVersion", value)}
        />
        <FieldLine
          label="摄像头分辨率"
          value={form.cameraResolution}
          onChange={(value) => onFormChange("cameraResolution", value)}
        />
        <FieldLine
          label="摄像头设备哈希"
          value={form.cameraDeviceIdHash}
          onChange={(value) => onFormChange("cameraDeviceIdHash", value)}
        />
        <FieldLine
          label="脱敏患者导出 ID"
          value={form.patientExportId}
          onChange={(value) => onFormChange("patientExportId", value)}
        />
        <FieldLine
          label="确认方案医师 ID"
          value={form.confirmedByDoctorId}
          onChange={(value) => onFormChange("confirmedByDoctorId", value)}
        />
        <FieldLine
          label="方案确认时间"
          value={form.confirmedAt}
          onChange={(value) => onFormChange("confirmedAt", value)}
        />
        <FieldLine
          label="训练完成截图路径"
          value={form.screenshotPath}
          onChange={(value) => onFormChange("screenshotPath", value)}
        />
        <FieldLine
          label="截图时间"
          value={form.screenshotCapturedAt}
          onChange={(value) => onFormChange("screenshotCapturedAt", value)}
        />
        <FieldLine
          label="训练录屏路径"
          value={form.recordingPath}
          onChange={(value) => onFormChange("recordingPath", value)}
        />
        <FieldLine
          label="录屏时间"
          value={form.recordingCapturedAt}
          onChange={(value) => onFormChange("recordingCapturedAt", value)}
        />
        <TextAreaField
          label="审计日志 ID（每行一条）"
          value={form.auditLogIdsText}
          onChange={(value) => onFormChange("auditLogIdsText", value)}
        />
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
        <StatusList
          items={[
            ["训练会话", `${session.sessionStatus} / ${session.syncStatus}`, session.sessionStatus === "completed" && session.syncStatus === "synced" ? "success" : "warning"],
            ["训练来源", result?.source ?? "待采集", result?.source === "browser_pose_canvas" ? "success" : "warning"],
            ["动作指标", `${session.motionMetrics?.length ?? 0} 项`, (session.motionMetrics?.length ?? 0) >= 4 ? "success" : "warning"],
            ["摄像头标签", readiness.cameraLabel ?? "未记录", readiness.cameraLabel ? "success" : "warning"],
          ]}
        />
      </div>

      <EvidenceChecklistPanel checklist={checklist} runtimeReady={browserRuntimeReady} />
      <TrainingAuditAcceptancePanel
        summary={auditSummary}
        onApplyAuditIds={(ids) => onFormChange("auditLogIdsText", ids.join("\n"))}
      />

      {message ? (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 font-bold leading-7 text-[var(--warning-strong)]">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="font-bold leading-7 text-[var(--ink-soft)]">
          导出后请把材料文件、截图和录屏放入同一资料目录，并归档审计截图；空字段、缺少附件或审计不一致都会被质控复核拒绝。
        </p>
        <PrimaryButton
          className="bg-[var(--ink-strong)] hover:bg-[var(--accent-strong)]"
          onClick={handleDownload}
          type="button"
        >
          导出质控记录
        </PrimaryButton>
      </div>
    </div>
  );
}

function buildBrowserPoseEvidenceInput({
  form,
  patient,
  currentPlan,
  planItem,
  session,
  result,
  readiness,
  auditSummary,
}: {
  form: BrowserPoseEvidenceFormState;
  patient: PatientProfile;
  currentPlan: RehabPlan;
  planItem: RehabPlan["items"][number];
  session: TrainingRecordsResponse["sessions"][number];
  result: NonNullable<TrainingRecordsResponse["sessions"][number]["result"]>;
  readiness: TrainingReadiness;
  auditSummary: TrainingAuditAcceptanceSummary | null;
}): BrowserPoseEvidenceInput {
  return {
    acceptance: {
      acceptedAt: form.acceptedAt.trim(),
      testerName: form.testerName.trim(),
      siteName: form.siteName.trim(),
      environment: form.environment.trim(),
    },
    browser: {
      name: form.browserName.trim(),
      version: form.browserVersion.trim(),
      userAgent: navigator.userAgent,
      pageUrl: window.location.href,
    },
    device: {
      deviceCode: session.deviceCode ?? "",
      cameraLabel: readiness.cameraLabel ?? "",
      cameraDeviceIdHash: form.cameraDeviceIdHash.trim(),
      resolution: form.cameraResolution.trim(),
    },
    poseRuntime: {
      runtimeType: "browser_pose_canvas",
      modelName: "MediaPipe PoseLandmarker",
      modelVersion: readiness.poseModelVersion ?? "",
      poseLandmarkCount: readiness.poseLandmarkCount ?? 0,
      checkedAt: readiness.poseCheckedAt ?? "",
      averageVisibility: readiness.poseAverageVisibility ?? Number.NaN,
    },
    patient: {
      patientId: patient.id,
      patientExportId: form.patientExportId.trim(),
    },
    gameContent: {
      gameContentId: session.gameContent.id,
      code: session.gameContent.code,
      name: session.gameContent.name,
      runtimeType: session.gameContent.runtimeType,
      gameVersion: session.gameContent.gameVersion ?? "",
      bridgeProtocolVersion: session.gameContent.bridgeProtocolVersion,
      releaseChannel: session.gameContent.releaseChannel,
      buildStatus: session.gameContent.buildStatus,
    },
    rehabPlan: {
      rehabPlanId: currentPlan.id,
      planItemId: planItem.id,
      confirmedByDoctorId: form.confirmedByDoctorId.trim(),
      confirmedAt: form.confirmedAt.trim(),
    },
    trainingSession: {
      sessionId: session.id,
      collectionBatchId: readRequiredText(
        session.collectionBatchId,
        "训练会话缺少正式采集批次，不能导出体感质控记录。",
      ),
      gameRunId: session.gameRunId ?? "",
      deviceCode: session.deviceCode ?? "",
      sessionStatus: session.sessionStatus,
      syncStatus: session.syncStatus,
      calibrationStatus: session.calibrationStatus,
      clientStartedAt: session.clientStartedAt ?? "",
      clientEndedAt: session.clientEndedAt ?? "",
    },
    trainingResult: {
      resultId: result.id,
      collectionBatchId: readRequiredText(
        result.collectionBatchId,
        "训练结果缺少正式采集批次，不能导出体感质控记录。",
      ),
      source: result.source,
      gameRunId: result.gameRunId,
      gameVersion: result.gameVersion,
      bridgeProtocolVersion: result.bridgeProtocolVersion,
      rawPayloadHash: result.rawPayloadHash,
      submittedAt: result.submittedAt,
      qualityFlag: result.qualityFlag,
      abnormalFlag: result.abnormalFlag,
      score: result.score,
      completionRate: result.completionRate,
      durationSeconds: result.durationSeconds,
      reactionTimeMs: result.reactionTimeMs,
      motionAccuracy: result.motionAccuracy,
      exerciseIntensity: result.exerciseIntensity,
    },
    motionMetrics: normalizeBrowserPoseEvidenceMotionMetrics(
      session.motionMetrics ?? [],
    ),
    auditEvidence: {
      auditLogIds: resolveTrainingEvidenceAuditLogIds(form, auditSummary),
      requiredActions: resolveTrainingEvidenceRequiredActions(session, auditSummary),
      checkedAt: new Date().toISOString(),
    },
    artifacts: {
      screenshots: [
        {
          label: "训练完成页",
          path: form.screenshotPath.trim(),
          capturedAt: form.screenshotCapturedAt.trim(),
        },
      ],
      recordings: [
        {
          label: "训练过程录屏",
          path: form.recordingPath.trim(),
          capturedAt: form.recordingCapturedAt.trim(),
        },
      ],
    },
  };
}

function EvidenceChecklistPanel({
  checklist,
  runtimeReady,
}: {
  checklist: BrowserPoseEvidenceChecklist | null;
  runtimeReady: boolean;
}) {
  if (!checklist) {
  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5">
        <Badge label="材料完整性检查" icon={ClipboardCheck} />
        <h5 className="mt-3 text-xl font-black text-[var(--ink-strong)]">
          还不能生成完整预检
        </h5>
        <p className="mt-2 font-bold leading-7 text-[var(--warning-strong)]">
          {runtimeReady
            ? "请确认患者、当前方案、方案项目和训练结果都已加载。"
            : "请先完成摄像头和姿态识别就绪检测，再导出训练质控记录。"}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge label="材料完整性检查" icon={ClipboardCheck} />
          <h5 className="mt-3 text-xl font-black text-[var(--ink-strong)]">
            {checklist.ready ? "质控材料字段已就绪" : "质控材料仍有缺项"}
          </h5>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            预检只提示缺项，不会自动补造证据；最终仍需完成材料自检和审计一致性校验。
          </p>
        </div>
        <Chip tone={checklist.ready ? "success" : "warning"}>
          {checklist.ready ? "可导出" : `${checklist.failures.length} 个问题`}
        </Chip>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {checklist.items.map((item) => (
          <div
            key={item.key}
            className={cn(
              "rounded-[var(--radius-card)] border p-4",
              item.ready
                ? "border-[var(--success-line)] bg-[var(--success-soft)]"
                : "border-[var(--warning-line)] bg-[var(--warning-soft)]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-[var(--ink-strong)]">{item.label}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                  {item.detail}
                </p>
              </div>
              <Chip tone={item.ready ? "success" : "warning"}>
                {item.ready ? "已就绪" : "待补齐"}
              </Chip>
            </div>
            {!item.ready ? (
              <ul className="mt-3 space-y-1 text-sm font-bold leading-6 text-[var(--warning-strong)]">
                {item.failures.slice(0, 3).map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function resolveTrainingEvidenceAuditLogIds(
  form: { auditLogIdsText: string },
  summary: TrainingAuditAcceptanceSummary | null,
) {
  return summary?.auditLogIds.length
    ? summary.auditLogIds
    : parseEvidenceTextList(form.auditLogIdsText);
}

function resolveTrainingEvidenceRequiredActions(
  session: TrainingRecordsResponse["sessions"][number],
  summary: TrainingAuditAcceptanceSummary | null,
) {
  return summary?.requiredActions ?? buildTrainingAuditAcceptanceRequiredActions(session);
}

function TrainingAuditAcceptancePanel({
  summary,
  onApplyAuditIds,
}: {
  summary: TrainingAuditAcceptanceSummary | null;
  onApplyAuditIds: (ids: string[]) => void;
}) {
  if (!summary) {
    return (
      <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5">
        <Badge label="审计自动聚合" icon={LockKeyhole} />
        <h5 className="mt-3 text-xl font-black text-[var(--ink-strong)]">
          等待审计日志数据
        </h5>
        <p className="mt-2 font-bold leading-7 text-[var(--warning-strong)]">
          当前页面尚未加载审计日志，不能自动匹配训练开始、结果提交或复核审计。请使用具备审计读取权限的账号查询日志后再生成正式验收材料。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge label="审计自动聚合" icon={LockKeyhole} />
          <h5 className="mt-3 text-xl font-black text-[var(--ink-strong)]">
            {summary.ready ? "训练审计链路已匹配" : "训练审计链路仍有缺口"}
          </h5>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            系统只读取已加载的真实审计日志，并要求 action、target 和 result 完全匹配；不会补写审计日志或把失败日志计为通过。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone={summary.ready ? "success" : "warning"}>
            {summary.ready ? "审计齐全" : `${summary.failures.length} 个缺口`}
          </Chip>
          <PrimaryButton
            className="bg-[var(--ink-strong)] hover:bg-[var(--accent-strong)]"
            disabled={summary.auditLogIds.length === 0}
            onClick={() => onApplyAuditIds(summary.auditLogIds)}
            type="button"
          >
            写入审计日志 ID
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {summary.items.map((item) => (
          <div
            key={item.action}
            className={cn(
              "rounded-[var(--radius-card)] border p-4",
              item.matched
                ? "border-[var(--success-line)] bg-[var(--success-soft)]"
                : "border-[var(--warning-line)] bg-[var(--warning-soft)]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-[var(--ink-strong)]">{item.label}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                  {item.auditLogId ?? item.detail}
                </p>
              </div>
              <Chip tone={item.matched ? "success" : "warning"}>
                {item.matched ? "已匹配" : "缺失"}
              </Chip>
            </div>
            {!item.matched ? (
              <ul className="mt-3 space-y-1 text-sm font-bold leading-6 text-[var(--warning-strong)]">
                {item.failures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function UnityFieldEvidencePanel({
  patient,
  currentPlan,
  session,
  auditSummary,
  form,
  onFormChange,
}: {
  patient?: PatientProfile;
  currentPlan?: RehabPlan | null;
  session: TrainingRecordsResponse["sessions"][number];
  auditSummary: TrainingAuditAcceptanceSummary | null;
  form: UnityFieldEvidenceFormState;
  onFormChange: (
    field: keyof UnityFieldEvidenceFormState,
    value: string,
  ) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const result = session.result;
  const planItem = currentPlan?.items.find((item) => item.id === session.planItemId);
  const game = session.gameContent;
  const unityBuildReady =
    game.runtimeType === "unity_webgl" &&
    game.buildStatus === "released" &&
    game.releaseChannel === "production" &&
    Boolean(game.manifestUrl?.trim()) &&
    Boolean(game.buildBaseUrl?.trim()) &&
    Boolean(game.gameVersion?.trim()) &&
    game.bridgeProtocolVersion === "1.0.0";

  function handleDownload() {
    setMessage(null);
    if (!patient || !currentPlan || !planItem || !result) {
      setMessage("缺少患者、当前方案、方案项目或 Unity 训练结果，不能导出实机证据。");
      return;
    }
    if (!unityBuildReady) {
      setMessage("Unity 训练内容未达到 production/released 或缺少正式 WebGL 构建地址。");
      return;
    }
    const requiredActions = buildTrainingAuditAcceptanceRequiredActions(session);
    if (requiredActions.includes("training_result.review")) {
      setMessage(
        "该训练结果属于异常或低质量复核链路，不能作为 Unity 训练质控样本。请使用有效且无异常的训练结果导出质控记录，并完成训练复核审计。",
      );
      return;
    }

    const bridgeEvent = buildUnityBridgeEvidenceFromResult(session, result);
    if (!bridgeEvent.ok) {
      setMessage(bridgeEvent.error);
      return;
    }

    let devicePixelRatio: number;
    try {
      devicePixelRatio = readRequiredFiniteNumber(
        form.devicePixelRatio,
        "Unity 屏幕像素比例必须填写为数字。",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unity 屏幕像素比例无效。",
      );
      return;
    }

    const evidenceResult = buildUnityFieldEvidenceInputFromRecord({
      acceptance: {
        acceptedAt: form.acceptedAt.trim(),
        testerName: form.testerName.trim(),
        siteName: form.siteName.trim(),
        environment: form.environment.trim(),
      },
      browser: {
        name: form.browserName.trim(),
        version: form.browserVersion.trim(),
        userAgent: navigator.userAgent,
        pageUrl: window.location.href,
      },
      device: {
        deviceCode: session.deviceCode ?? "",
        deviceType: form.deviceType.trim(),
        inputMode: form.inputMode.trim(),
        calibrationStatus: session.calibrationStatus,
        resolution: form.deviceResolution.trim(),
      },
      unityRuntime: {
        runtimeType: "unity_webgl",
        manifestUrl: game.manifestUrl ?? "",
        buildBaseUrl: game.buildBaseUrl ?? "",
        gameVersion: game.gameVersion ?? "",
        bridgeProtocolVersion: game.bridgeProtocolVersion,
        loaderLoadedAt: form.loaderLoadedAt.trim(),
        unityInstanceStartedAt: form.unityInstanceStartedAt.trim(),
        canvasResolution: form.canvasResolution.trim(),
        devicePixelRatio,
      },
      patient: {
        patientId: patient.id,
        patientExportId: form.patientExportId.trim(),
      },
      gameContent: game,
      rehabPlan: {
        rehabPlanId: currentPlan.id,
        planItemId: planItem.id,
        durationMinutes: planItem.durationMinutes,
        confirmedByDoctorId: form.confirmedByDoctorId.trim(),
        confirmedAt: form.confirmedAt.trim(),
      },
      trainingSession: session,
      bridgeEvent: bridgeEvent.value,
      trainingResult: result,
      motionMetrics: session.motionMetrics ?? [],
      auditEvidence: {
        auditLogIds: resolveTrainingEvidenceAuditLogIds(form, auditSummary),
        requiredActions: resolveTrainingEvidenceRequiredActions(session, auditSummary),
        checkedAt: new Date().toISOString(),
      },
      artifacts: {
        screenshots: [
          {
            label: "Unity 训练完成页",
            path: form.screenshotPath.trim(),
            capturedAt: form.screenshotCapturedAt.trim(),
          },
        ],
        recordings: [
          {
            label: "Unity 训练过程录屏",
            path: form.recordingPath.trim(),
            capturedAt: form.recordingCapturedAt.trim(),
          },
        ],
      },
    });

    if (!evidenceResult.ok) {
      setMessage(evidenceResult.error);
      return;
    }

    downloadJsonFile(
      evidenceResult.evidence,
      `unity-field-evidence-${session.id}.json`,
    );
    setMessage(
      [
        "Unity 训练质控记录已生成。请将文件、截图和录屏放入同一资料目录，并按机构归档要求完成材料复核。",
      ].join("\n"),
    );
  }

  return (
    <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--line-info)] bg-[var(--surface-info)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge label="Unity 训练质控" icon={Gamepad2} />
          <h4 className="mt-3 text-2xl font-black text-[var(--ink-strong)]">
            导出 Unity 训练质控记录
          </h4>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            仅基于已入库的 Unity 训练结果、正式训练资源和现场附件生成记录。资源加载时间、画布信息、审计日志和截图录屏必须显式填写。
          </p>
        </div>
        <Chip tone={unityBuildReady ? "success" : "warning"}>
          {unityBuildReady ? "Unity 构建已发布" : "缺正式构建配置"}
        </Chip>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <FieldLine
          label="验收时间"
          value={form.acceptedAt}
          onChange={(value) => onFormChange("acceptedAt", value)}
        />
        <FieldLine
          label="验收人员"
          value={form.testerName}
          onChange={(value) => onFormChange("testerName", value)}
        />
        <FieldLine
          label="验收现场"
          value={form.siteName}
          onChange={(value) => onFormChange("siteName", value)}
        />
        <FieldLine
          label="环境标识"
          value={form.environment}
          onChange={(value) => onFormChange("environment", value)}
        />
        <FieldLine
          label="浏览器名称"
          value={form.browserName}
          onChange={(value) => onFormChange("browserName", value)}
        />
        <FieldLine
          label="浏览器版本"
          value={form.browserVersion}
          onChange={(value) => onFormChange("browserVersion", value)}
        />
        <FieldLine
          label="设备类型"
          value={form.deviceType}
          onChange={(value) => onFormChange("deviceType", value)}
        />
        <FieldLine
          label="输入方式"
          value={form.inputMode}
          onChange={(value) => onFormChange("inputMode", value)}
        />
        <FieldLine
          label="设备分辨率"
          value={form.deviceResolution}
          onChange={(value) => onFormChange("deviceResolution", value)}
        />
        <FieldLine
          label="屏幕像素比例"
          value={form.devicePixelRatio}
          onChange={(value) => onFormChange("devicePixelRatio", value)}
          type="number"
        />
        <FieldLine
          label="Unity loader 加载时间"
          value={form.loaderLoadedAt}
          onChange={(value) => onFormChange("loaderLoadedAt", value)}
        />
        <FieldLine
          label="Unity 实例启动时间"
          value={form.unityInstanceStartedAt}
          onChange={(value) => onFormChange("unityInstanceStartedAt", value)}
        />
        <FieldLine
          label="Unity Canvas 分辨率"
          value={form.canvasResolution}
          onChange={(value) => onFormChange("canvasResolution", value)}
        />
        <FieldLine
          label="脱敏患者导出 ID"
          value={form.patientExportId}
          onChange={(value) => onFormChange("patientExportId", value)}
        />
        <FieldLine
          label="确认方案医师 ID"
          value={form.confirmedByDoctorId}
          onChange={(value) => onFormChange("confirmedByDoctorId", value)}
        />
        <FieldLine
          label="方案确认时间"
          value={form.confirmedAt}
          onChange={(value) => onFormChange("confirmedAt", value)}
        />
        <FieldLine
          label="Unity 完成截图路径"
          value={form.screenshotPath}
          onChange={(value) => onFormChange("screenshotPath", value)}
        />
        <FieldLine
          label="截图时间"
          value={form.screenshotCapturedAt}
          onChange={(value) => onFormChange("screenshotCapturedAt", value)}
        />
        <FieldLine
          label="Unity 训练录屏路径"
          value={form.recordingPath}
          onChange={(value) => onFormChange("recordingPath", value)}
        />
        <FieldLine
          label="录屏时间"
          value={form.recordingCapturedAt}
          onChange={(value) => onFormChange("recordingCapturedAt", value)}
        />
        <TextAreaField
          label="审计日志 ID（每行一条）"
          value={form.auditLogIdsText}
          onChange={(value) => onFormChange("auditLogIdsText", value)}
        />
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
        <StatusList
          items={[
            ["训练会话", `${session.sessionStatus} / ${session.syncStatus}`, session.sessionStatus === "completed" && session.syncStatus === "synced" ? "success" : "warning"],
            ["训练来源", result?.source ?? "待采集", result?.source === "unity_webgl" ? "success" : "warning"],
            ["Unity 构建", `${game.releaseChannel} / ${game.buildStatus}`, unityBuildReady ? "success" : "warning"],
            ["动作指标", `${session.motionMetrics?.length ?? 0} 项`, (session.motionMetrics?.length ?? 0) > 0 ? "success" : "warning"],
          ]}
        />
      </div>

      <TrainingAuditAcceptancePanel
        summary={auditSummary}
        onApplyAuditIds={(ids) => onFormChange("auditLogIdsText", ids.join("\n"))}
      />

      {message ? (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 font-bold leading-7 text-[var(--warning-strong)]">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="font-bold leading-7 text-[var(--ink-soft)]">
          导出前请确认原始训练载荷不会写入材料，只保留数据指纹、结构化训练指标和现场附件信息。
        </p>
        <PrimaryButton
          className="bg-[var(--ink-strong)] hover:bg-[var(--accent-strong)]"
          onClick={handleDownload}
          type="button"
        >
          导出 Unity 质控记录
        </PrimaryButton>
      </div>
    </div>
  );
}


export function TrainingQualityEvidenceSection({
  patient,
  currentPlan,
  trainingRecords,
  auditLogs,
  readiness,
  evidenceForm,
  onEvidenceFormChange,
  onEvidenceFormPrefill,
  unityEvidenceForm,
  onUnityEvidenceFormChange,
}: {
  patient?: PatientProfile;
  currentPlan?: RehabPlan | null;
  trainingRecords?: TrainingRecordsResponse;
  auditLogs?: AuditLog[];
  readiness: TrainingReadiness;
  evidenceForm: BrowserPoseEvidenceFormState;
  onEvidenceFormChange: (
    field: keyof BrowserPoseEvidenceFormState,
    value: string,
  ) => void;
  onEvidenceFormPrefill: (
    prefill: Partial<BrowserPoseEvidenceFormState>,
  ) => void;
  unityEvidenceForm: UnityFieldEvidenceFormState;
  onUnityEvidenceFormChange: (
    field: keyof UnityFieldEvidenceFormState,
    value: string,
  ) => void;
}) {
  const latest = trainingRecords?.sessions.find((session) => session.result);
  const auditSummary =
    latest && auditLogs
      ? buildTrainingAuditAcceptanceSummary({ session: latest, auditLogs })
      : null;
  const browserPoseSession =
    latest?.gameContent.runtimeType === "browser_pose_canvas" ? latest : undefined;
  const unitySession =
    latest?.gameContent.runtimeType === "unity_webgl" ? latest : undefined;

  return (
    <SurfacePanel className="md:col-span-4">
      <Badge label="训练质控" icon={FileText} />
      <h3 className="mt-4 text-2xl font-black">训练验收材料归档</h3>
      <p className="mt-2 max-w-4xl font-bold leading-7 text-[var(--ink-soft)]">
        该区域仅供管理员和审计人员归档现场材料。患者端只展示训练反馈，不展示审计编号、证据文件或质控导出入口。
      </p>
      {!latest ? (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 font-bold leading-7 text-[var(--warning-strong)]">
          当前患者没有可归档的训练结果。完成真实训练并回传结果后，才能生成质控材料。
        </div>
      ) : null}
      {browserPoseSession ? (
        <BrowserPoseEvidencePanel
          patient={patient}
          currentPlan={currentPlan}
          session={browserPoseSession}
          auditSummary={auditSummary}
          readiness={readiness}
          form={evidenceForm}
          onFormChange={onEvidenceFormChange}
          onFormPrefill={onEvidenceFormPrefill}
        />
      ) : null}
      {unitySession ? (
        <UnityFieldEvidencePanel
          patient={patient}
          currentPlan={currentPlan}
          session={unitySession}
          auditSummary={auditSummary}
          form={unityEvidenceForm}
          onFormChange={onUnityEvidenceFormChange}
        />
      ) : null}
    </SurfacePanel>
  );
}


function FieldLine({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "datetime-local";
}) {
  const inputId = useId();

  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[var(--ink-soft)]" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 font-mono text-lg font-bold outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const textAreaId = useId();

  return (
    <div className="mt-5">
      <label className="text-sm font-black text-[var(--ink-soft)]" htmlFor={textAreaId}>
        {label}
      </label>
      <textarea
        id={textAreaId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 text-lg font-bold leading-7 outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </div>
  );
}

function StatusList({
  items,
}: {
  items: Array<[string, string, StatusTone]>;
}) {
  return (
    <div className="mt-4 grid gap-3">
      {items.map(([label, value, tone], index) => (
        <div
          key={`${label}-${value}-${index}`}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-4"
        >
          <span className="font-black">{label}</span>
          <Chip tone={tone}>{value}</Chip>
        </div>
      ))}
    </div>
  );
}

function Badge({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof FileText;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function Chip({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
}) {
  const tones = {
    info: "bg-[var(--accent-soft)] text-[var(--accent-stronger)]",
    success: "bg-[var(--success-soft)] text-[var(--success-strong)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning-strong)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
    muted: "bg-[var(--surface-muted)] text-[var(--ink-soft)]",
  };
  return (
    <StatusBadge
      className={tones[tone]}
      status={
        tone === "success"
          ? "complete"
          : tone === "warning"
            ? "pending"
            : tone === "danger"
              ? "blocked"
              : tone === "muted"
                ? "review"
                : "ready"
      }
    >
      {children}
    </StatusBadge>
  );
}

function PrimaryButton({
  className,
  children,
  disabled,
  onClick,
  type = "button",
}: {
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <Button type={type} disabled={disabled} onClick={onClick} className={className}>
      {children}
    </Button>
  );
}

const SurfacePanel = function SurfacePanelAlias({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <Card className={cn(className)}>{children}</Card>;
};

function downloadJsonFile(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function parseEvidenceTextList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
