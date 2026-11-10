"use client";

import { PoseCheckPreview, type CheckPoseAction } from "./PoseCheckPreview";
import { Camera, MonitorCheck, Radar, ShieldCheck } from "lucide-react";
import { WorkbenchLayout } from "@/components/layout/WorkbenchLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TrainingReadiness } from "@/features/training-runtime/types";
import type { ConsentRecord, ConsentType, PatientProfile } from "@/types/api";
import {
  patientConsentVersion,
  summarizePatientConsents,
} from "./patient-consent-model";
import type { StatusTone } from "./plan-suggestion-model";

type DevicePermissionCenterPageProps = {
  patient?: PatientProfile;
  readiness: TrainingReadiness;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  onCheckDevice: () => Promise<void>;
  onCheckPose: CheckPoseAction;
  isConsentBusy: boolean;
  isRevokingConsent: boolean;
  isCheckingDevice: boolean;
  isCheckingPose: boolean;
};

export function DevicePermissionCenterPage({
  patient,
  readiness,
  onGrantConsent,
  onRevokeConsent,
  onCheckDevice,
  onCheckPose,
  isConsentBusy,
  isRevokingConsent,
  isCheckingDevice,
  isCheckingPose,
}: DevicePermissionCenterPageProps) {
  const consentState = patient ? summarizePatientConsents(patient) : {};
  const cameraConsent = consentState.camera_capture;
  const microphoneConsent = consentState.microphone_capture;

  if (!patient) {
    return (
      <Card>
        <SectionLabel icon={MonitorCheck} label="等待数据" />
        <h2 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
          等待患者设备上下文
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-[var(--ink-soft)]">
          请先登录患者账号，或由医师/管理员选择一个患者后再检查设备与权限。
        </p>
      </Card>
    );
  }

  const cameraReady =
    readiness.cameraPermission === "granted" &&
    Boolean(readiness.cameraDeviceId);
  const poseReady = readiness.poseRuntimeStatus === "ready";

  return (
    <WorkbenchLayout
      aside={
        <DeviceReadinessSummary
          cameraConsent={Boolean(cameraConsent)}
          microphoneConsent={Boolean(microphoneConsent)}
          cameraReady={cameraReady}
          poseReady={poseReady}
        />
      }
      eyebrow="设备与权限"
      subtitle="训练前确认授权、摄像头和站位状态。所有检查都以真实设备和当前授权为准。"
      title="设备与权限中心"
    >
      <Card>
        <SectionLabel icon={ShieldCheck} label="权限签署" />
        <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
          训练权限状态
        </h3>
        <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
          摄像头训练和语音评估需要分别签署授权；撤回后，对应能力会停止使用。
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <DeviceConsentCard
            title="摄像头训练授权"
            description="用于帮助系统判断动作是否到位，并记录反应时间和动作准确率。"
            record={cameraConsent}
            consentType="camera_capture"
            onGrantConsent={onGrantConsent}
            onRevokeConsent={onRevokeConsent}
            isBusy={isConsentBusy}
            isRevoking={isRevokingConsent}
          />
          <DeviceConsentCard
            title="语音评估授权"
            description="用于评估录音、语音转写和题目播报；未完成授权时不会启用麦克风。"
            record={microphoneConsent}
            consentType="microphone_capture"
            onGrantConsent={onGrantConsent}
            onRevokeConsent={onRevokeConsent}
            isBusy={isConsentBusy}
            isRevoking={isRevokingConsent}
          />
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <CameraCheck
          readiness={readiness}
          onCheckDevice={onCheckDevice}
          isChecking={isCheckingDevice}
          hasCameraConsent={Boolean(cameraConsent)}
        />
        <PoseCheckCard
          readiness={readiness}
          onCheckPose={onCheckPose}
          isChecking={isCheckingPose}
          cameraReady={cameraReady}
          hasCameraConsent={Boolean(cameraConsent)}
        />
      </div>
    </WorkbenchLayout>
  );
}

function DeviceConsentCard({
  title,
  description,
  record,
  consentType,
  onGrantConsent,
  onRevokeConsent,
  isBusy,
  isRevoking,
}: {
  title: string;
  description: string;
  record?: ConsentRecord;
  consentType: ConsentType;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  isBusy: boolean;
  isRevoking: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-lg font-black text-[var(--ink-strong)]">{title}</h4>
        <ToneBadge tone={record ? "success" : "warning"}>
          {record ? "已签署" : "待签署"}
        </ToneBadge>
      </div>
      <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
        {description}
      </p>
      <p className="mt-3 text-xs font-bold text-[var(--ink-subtle)]">
        {record
          ? `版本 ${record.consentVersion} · ${formatDateTime(record.grantedAt)}`
          : `待签署版本 ${patientConsentVersion}`}
      </p>
      {record ? (
        <Button
          className="mt-4 w-full"
          intent="danger"
          disabled={isRevoking}
          onClick={() => void onRevokeConsent(record)}
        >
          {isRevoking ? "撤回中" : "撤回授权"}
        </Button>
      ) : (
        <Button
          className="mt-4 w-full"
          disabled={isBusy}
          onClick={() => void onGrantConsent(consentType)}
        >
          {isBusy ? "签署中" : "签署授权"}
        </Button>
      )}
    </div>
  );
}

function DeviceReadinessSummary({
  cameraConsent,
  microphoneConsent,
  cameraReady,
  poseReady,
}: {
  cameraConsent: boolean;
  microphoneConsent: boolean;
  cameraReady: boolean;
  poseReady: boolean;
}) {
  const readyCount = [
    cameraConsent,
    microphoneConsent,
    cameraReady,
    poseReady,
  ].filter(Boolean).length;

  return (
    <Card>
      <SectionLabel icon={MonitorCheck} label="训练准备度" />
      <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
        {readyCount}/4 项完成
      </h3>
      <StatusList
        items={[
          [
            "摄像头授权",
            cameraConsent ? "已签署" : "待签署",
            cameraConsent ? "success" : "warning",
          ],
          [
            "麦克风授权",
            microphoneConsent ? "已签署" : "待签署",
            microphoneConsent ? "success" : "warning",
          ],
          [
            "摄像头硬件",
            cameraReady ? "已识别" : "待检测",
            cameraReady ? "success" : "warning",
          ],
          [
            "站位状态",
            poseReady ? "已就绪" : "待检测",
            poseReady ? "success" : "warning",
          ],
        ]}
      />
      <p className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-4 text-sm font-bold leading-6 text-[var(--ink-soft)]">
        后续训练只保存动作表现和必要摘要，不保存完整视频。
      </p>
    </Card>
  );
}

function CameraCheck({
  readiness,
  onCheckDevice,
  isChecking: isCheckingOverride,
  hasCameraConsent,
}: {
  readiness: TrainingReadiness;
  onCheckDevice: () => Promise<void>;
  isChecking?: boolean;
  hasCameraConsent: boolean;
}) {
  const isChecking =
    isCheckingOverride ?? readiness.cameraPermission === "requesting";
  const isGranted = readiness.cameraPermission === "granted";
  const { error: cameraCheckError } = readiness;

  return (
    <Card>
      <SectionLabel icon={Camera} label="设备检测" />
      <div className="mt-5 grid h-64 place-items-center rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)]">
        <div className="relative h-40 w-36">
          <span className="absolute left-1/2 top-0 h-11 w-11 -translate-x-1/2 rounded-[var(--radius-control)] bg-[var(--accent-strong)]" />
          <span className="absolute left-1/2 top-14 h-24 w-3 -translate-x-1/2 rounded-[var(--radius-control)] bg-[var(--accent-strong)]" />
          <span className="absolute left-2 top-20 h-3 w-32 rotate-[-20deg] rounded-[var(--radius-control)] bg-[var(--accent-strong)]" />
          <span className="absolute left-4 top-32 h-3 w-24 rotate-[-55deg] rounded-[var(--radius-control)] bg-[var(--accent-strong)]" />
          <span className="absolute right-4 top-32 h-3 w-24 rotate-[55deg] rounded-[var(--radius-control)] bg-[var(--accent-strong)]" />
        </div>
      </div>
      <StatusList
        items={[
          [
            "摄像头权限",
            isChecking ? "请求中" : isGranted ? "已授权" : "未授权",
            isGranted ? "success" : isChecking ? "info" : "warning",
          ],
          [
            "摄像头设备",
            readiness.cameraDeviceId ? "已识别" : "未识别",
            readiness.cameraDeviceId ? "success" : "warning",
          ],
          [
            "检测时间",
            readiness.checkedAt
              ? formatDateTime(readiness.checkedAt)
              : "未检测",
            readiness.checkedAt ? "success" : "warning",
          ],
        ]}
      />
      {cameraCheckError ? (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 text-sm font-bold leading-6 text-[var(--danger-strong)]">
          {cameraCheckError}
        </p>
      ) : null}
      <Button
        className="mt-5 w-full"
        disabled={!hasCameraConsent || isChecking}
        onClick={() => void onCheckDevice()}
      >
        {isChecking
          ? "正在请求摄像头"
          : hasCameraConsent
            ? "检测摄像头设备"
            : "请先签署摄像头授权"}
      </Button>
    </Card>
  );
}

function PoseCheckCard({
  readiness,
  onCheckPose,
  isChecking,
  cameraReady,
  hasCameraConsent,
}: {
  readiness: TrainingReadiness;
  onCheckPose: CheckPoseAction;
  isChecking: boolean;
  cameraReady: boolean;
  hasCameraConsent: boolean;
}) {
  const poseReady = readiness.poseRuntimeStatus === "ready";
  const blocked = !hasCameraConsent || !cameraReady;
  const { poseError } = readiness;

  return (
    <Card>
      <SectionLabel icon={Radar} label="站位检查" />
      <StatusList
        items={[
          [
            "检查状态",
            isChecking
              ? "加载中"
              : poseReady
                ? "已就绪"
                : readiness.poseRuntimeStatus === "error"
                  ? "检测失败"
                  : "未检测",
            poseReady ? "success" : isChecking ? "info" : "warning",
          ],
          [
            "训练准备",
            poseReady ? "可以训练" : "待检测",
            poseReady ? "success" : "warning",
          ],
        ]}
      />
      {poseError ? (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 text-sm font-bold leading-6 text-[var(--danger-strong)]">
          {poseError}
        </p>
      ) : null}
      <PoseCheckPreview
        onCheckPose={onCheckPose}
        disabled={blocked}
        isChecking={isChecking}
      />
    </Card>
  );
}

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: typeof MonitorCheck;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </div>
  );
}

function StatusList({ items }: { items: Array<[string, string, StatusTone]> }) {
  return (
    <div className="mt-4 grid gap-3">
      {items.map(([label, value, tone], index) => (
        <div
          key={`${label}-${value}-${index}`}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-4"
        >
          <span className="font-black">{label}</span>
          <ToneBadge tone={tone}>{value}</ToneBadge>
        </div>
      ))}
    </div>
  );
}

function ToneBadge({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <StatusBadge
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

function formatDateTime(value?: string) {
  if (!value) return "待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
