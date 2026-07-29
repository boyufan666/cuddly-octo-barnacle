"use client";

import { ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  CaregiverRelation,
  CaregiverScope,
  ConsentRecord,
  ConsentType,
  PatientProfile,
} from "@/types/api";
import {
  patientConsentDefinitions,
  summarizePatientConsents,
} from "./patient-consent-model";

export type PatientCaregiverBindingFormState = {
  caregiverAccount: string;
  relation: string;
  summary: boolean;
  reminders: boolean;
  progress: boolean;
};

type PatientProfilePageProps = {
  caregiverBindingForm: PatientCaregiverBindingFormState;
  isBindingCaregiver: boolean;
  isConsentBusy: boolean;
  isRevokingCaregiver: boolean;
  isRevokingConsent: boolean;
  onBindCaregiver: (form: PatientCaregiverBindingFormState) => Promise<void>;
  onCaregiverBindingFormChange: (
    field: keyof PatientCaregiverBindingFormState,
    value: string | boolean,
  ) => void;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeCaregiver: (relation: CaregiverRelation) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
  patient?: PatientProfile;
};

export function PatientProfilePage({
  caregiverBindingForm,
  isBindingCaregiver,
  isConsentBusy,
  isRevokingCaregiver,
  isRevokingConsent,
  onBindCaregiver,
  onCaregiverBindingFormChange,
  onGrantConsent,
  onRevokeCaregiver,
  onRevokeConsent,
  patient,
}: PatientProfilePageProps) {
  if (!patient) {
    return (
      <EmptyState
        title="等待患者资料"
        description="请由机构先完成患者建档，随后这里会显示资料、授权和家属可见范围。"
      />
    );
  }

  const consentState = summarizePatientConsents(patient);
  const canManageCaregiver = Boolean(consentState.caregiver_sharing);

  return (
    <section className="grid gap-5" data-testid="patient-profile-page">
      <PageHeader
        eyebrow="我的"
        title="我的资料与授权"
        description="查看个人资料、隐私授权、训练授权和家属可见范围。"
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-5">
          <Card tone="patient">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-[var(--radius-card)] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                <UserRound className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-[var(--ink-soft)]">
                  康复对象
                </p>
                <h3 className="text-2xl font-black text-[var(--ink-strong)]">
                  {patient.name}
                </h3>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <InfoLine label="年龄段" value={ageRangeLabel(patient.age)} />
              <InfoLine label="联系方式" value={maskPhone(patient.mobilePhone)} />
              <InfoLine
                label="负责医师"
                value={patient.responsibleDoctor?.user.displayName ?? "待安排"}
              />
              <InfoLine label="照护联系人" value={patient.caregiverName ?? "未填写"} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {healthMetricChips(patient.healthMetrics).map((item) => (
                <StatusBadge key={item} status="review">
                  {item}
                </StatusBadge>
              ))}
            </div>
          </Card>

          <ConsentList
            consentState={consentState}
            isBusy={isConsentBusy}
            isRevoking={isRevokingConsent}
            onGrantConsent={onGrantConsent}
            onRevokeConsent={onRevokeConsent}
          />

          <CaregiverBindingSection
            canManageCaregiver={canManageCaregiver}
            form={caregiverBindingForm}
            isBinding={isBindingCaregiver}
            isConsentBusy={isConsentBusy}
            isRevoking={isRevokingCaregiver}
            onBindCaregiver={onBindCaregiver}
            onChange={onCaregiverBindingFormChange}
            onGrantCaregiverSharing={() => void onGrantConsent("caregiver_sharing")}
            onRevokeCaregiver={onRevokeCaregiver}
            patient={patient}
          />
        </div>

        <Card tone="patient">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden="true" />
            <h3 className="text-xl font-black text-[var(--ink-strong)]">
              可见范围
            </h3>
          </div>
          <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            家属端只显示授权范围内的照护摘要、训练进展和提醒事项。
          </p>
          <VisibleScopeList />
        </Card>
      </div>
    </section>
  );
}

function VisibleScopeList() {
  return (
    <ul className="mt-5 grid gap-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
      {["照护摘要", "训练进展", "医生提醒"].map((item) => (
        <li
          key={item}
          className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function ConsentList({
  consentState,
  isBusy,
  isRevoking,
  onGrantConsent,
  onRevokeConsent,
}: {
  consentState: Partial<Record<ConsentType, ConsentRecord>>;
  isBusy: boolean;
  isRevoking: boolean;
  onGrantConsent: (consentType: ConsentType) => Promise<void>;
  onRevokeConsent: (record: ConsentRecord) => Promise<void>;
}) {
  return (
    <Card tone="patient">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden="true" />
        <h3 className="text-xl font-black text-[var(--ink-strong)]">
          隐私授权
        </h3>
      </div>
      <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
        授权可随时查看和撤回；撤回后，对应服务将停止使用。
      </p>
      <div className="mt-5 grid gap-3">
        {patientConsentDefinitions.map((definition) => {
          const record = consentState[definition.type];
          return (
            <div
              key={definition.type}
              className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-black text-[var(--ink-strong)]">
                    {definition.title}
                  </h4>
                  <StatusBadge status={record ? "complete" : "pending"}>
                    {record ? "已授权" : "待授权"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
                  {definition.description}
                </p>
              </div>
              {record ? (
                <Button
                  intent="danger"
                  disabled={isRevoking}
                  onClick={() => void onRevokeConsent(record)}
                >
                  {isRevoking ? "撤回中" : "撤回授权"}
                </Button>
              ) : (
                <Button
                  disabled={isBusy}
                  onClick={() => void onGrantConsent(definition.type)}
                >
                  {isBusy ? "授权中" : "确认授权"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CaregiverBindingSection({
  canManageCaregiver,
  form,
  isBinding,
  isConsentBusy,
  isRevoking,
  onBindCaregiver,
  onChange,
  onGrantCaregiverSharing,
  onRevokeCaregiver,
  patient,
}: {
  canManageCaregiver: boolean;
  form: PatientCaregiverBindingFormState;
  isBinding: boolean;
  isConsentBusy: boolean;
  isRevoking: boolean;
  onBindCaregiver: (form: PatientCaregiverBindingFormState) => Promise<void>;
  onChange: (
    field: keyof PatientCaregiverBindingFormState,
    value: string | boolean,
  ) => void;
  onGrantCaregiverSharing: () => void;
  onRevokeCaregiver: (relation: CaregiverRelation) => Promise<void>;
  patient: PatientProfile;
}) {
  const canSubmit =
    canManageCaregiver &&
    form.caregiverAccount.trim().length >= 4 &&
    form.relation.trim().length > 0 &&
    form.summary;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBinding) return;
    void onBindCaregiver(form);
  }

  return (
    <Card tone="patient">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden="true" />
          <h3 className="text-xl font-black text-[var(--ink-strong)]">
            家属授权绑定
          </h3>
        </div>
        <StatusBadge status={canManageCaregiver ? "complete" : "pending"}>
          {canManageCaregiver ? "共享已开启" : "待开启共享"}
        </StatusBadge>
      </div>
      <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-soft)]">
        绑定已开通的家属账号，并选择家属端可见范围。
      </p>
      {!canManageCaregiver ? (
        <Button
          className="mt-4 w-full"
          intent="secondary"
          disabled={isConsentBusy}
          onClick={onGrantCaregiverSharing}
        >
          {isConsentBusy ? "开启中" : "先开启家属共享"}
        </Button>
      ) : null}

      <div className="mt-4 grid gap-3">
        {patient.caregiverRelations.length ? (
          patient.caregiverRelations.map((relation) => (
            <div
              key={relation.id}
              className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black text-[var(--ink-strong)]">
                    {relation.caregiver.displayName} · {relation.relation}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-soft)]">
                    {relation.caregiver.account}
                  </p>
                </div>
                <Button
                  intent="danger"
                  disabled={isRevoking}
                  onClick={() => void onRevokeCaregiver(relation)}
                >
                  {isRevoking ? "撤回中" : "撤回"}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {caregiverScopeChips(relation.scope).map((item) => (
                  <StatusBadge key={item} status="ready">
                    {item}
                  </StatusBadge>
                ))}
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="暂无家属绑定"
            description="完成绑定后，家属可在授权范围内查看照护摘要。"
          />
        )}
      </div>

      <form className="mt-4" onSubmit={submit}>
        <ProfileInput
          label="家属手机号或账号"
          value={form.caregiverAccount}
          onChange={(value) => onChange("caregiverAccount", value)}
        />
        <ProfileInput
          label="与患者关系"
          value={form.relation}
          onChange={(value) => onChange("relation", value)}
        />
        <div className="mt-4 grid gap-2">
          <ProfileCheck
            checked={form.summary}
            disabled
            label="训练与计划摘要"
            onChange={(value) => onChange("summary", value)}
          />
          <ProfileCheck
            checked={form.reminders}
            label="每日提醒"
            onChange={(value) => onChange("reminders", value)}
          />
          <ProfileCheck
            checked={form.progress}
            label="阶段进展"
            onChange={(value) => onChange("progress", value)}
          />
        </div>
        <Button className="mt-4 w-full" disabled={!canSubmit || isBinding} type="submit">
          {isBinding
            ? "正在绑定家属"
            : canManageCaregiver
              ? "绑定家属账号"
              : "开启共享后可绑定"}
        </Button>
      </form>
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4">
      <p className="text-sm font-bold text-[var(--ink-soft)]">{label}</p>
      <p className="mt-1 text-base font-black text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function ProfileInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const inputId = `patient-profile-${label}`;

  return (
    <div className="mt-4">
      <label className="text-sm font-black text-[var(--ink-soft)]" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-base font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </div>
  );
}

function ProfileCheck({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const inputId = `patient-profile-${label}`;

  return (
    <label
      className="flex min-h-12 items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
      htmlFor={inputId}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function caregiverScopeChips(scope: CaregiverScope) {
  const rows: Array<[keyof CaregiverScope, string]> = [
    ["summary", "摘要"],
    ["reminders", "提醒"],
    ["progress", "进展"],
  ];
  return rows.filter(([key]) => scope[key]).map(([, label]) => label);
}

function maskPhone(value?: string | null) {
  if (!value) return "未填写";
  if (value.length < 7) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function ageRangeLabel(age: number) {
  const lower = Math.floor(age / 10) * 10;
  const upper = lower + 9;
  return `${lower}-${upper} 岁`;
}

function healthMetricChips(metrics: Record<string, unknown>) {
  const chips = [
    ["血压", metrics.bloodPressure],
    ["心率", metrics.heartRate],
    ["步态风险", metrics.gaitRisk],
  ]
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value]) => `${label} ${String(value)}`);
  return chips.length ? chips : ["暂无健康指标"];
}
