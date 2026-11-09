"use client";

import { ClipboardList, UserRoundCheck } from "lucide-react";
import type { PatientProfile, RehabPlan, RiskGrade } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type PatientQueueProps = {
  patients?: PatientProfile[];
  selectedPatientId?: string | null;
  onSelectPatient: (patientId: string) => void | Promise<void>;
};

export function PatientQueue({
  patients,
  selectedPatientId,
  onSelectPatient,
}: PatientQueueProps) {
  const patientsUnavailable = patients === undefined;
  const loadedPatients = patients ?? [];
  return (
    <Card tone="workbench">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            患者队列
          </div>
          <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
            负责患者工作清单
          </h3>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            选择患者后查看临床摘要、评估证据、康复计划和训练结果复核。
          </p>
        </div>
        <StatusBadge
          status={
            patientsUnavailable
              ? "review"
              : loadedPatients.length
                ? "ready"
                : "review"
          }
        >
          {patientsUnavailable
            ? "患者列表未加载"
            : loadedPatients.length
              ? `${loadedPatients.length} 位患者`
              : "未分配患者"}
        </StatusBadge>
      </div>

      {loadedPatients.length ? (
        <div className="mt-5 grid gap-3 md:hidden">
          {loadedPatients.map((patient) => {
            const risk = currentRisk(patient);
            const plan = currentPlan(patient);
            const latestTraining = patient.trainingSessions?.[0];
            const selected = selectedPatientId === patient.id;

            return (
              <article
                key={patient.id}
                className={[
                  "grid min-w-0 gap-3 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4",
                  selected ? "bg-[var(--surface-muted)]" : "",
                ].join(" ")}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="break-words text-lg font-black text-[var(--ink-strong)]">
                      {patient.name}
                    </h4>
                    <p className="mt-1 break-words text-sm font-bold text-[var(--ink-subtle)]">
                      {patient.age}岁 · 档案号 {shortId(patient.id)}
                    </p>
                  </div>
                  <StatusBadge status={riskStatus(risk?.riskLevel)}>
                    {riskLabel(risk?.riskLevel)}
                  </StatusBadge>
                </div>

                <dl className="grid min-w-0 gap-2 text-sm font-bold text-[var(--ink-soft)]">
                  <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-[var(--ink-subtle)]">方案</dt>
                    <dd className="min-w-0 break-words">
                      {plan ? planStatusLabel(plan.status) : "未确认方案"}
                    </dd>
                  </div>
                  <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-[var(--ink-subtle)]">最近训练</dt>
                    <dd className="min-w-0 break-words">
                      {latestTraining
                        ? formatDateTime(latestTraining.startedAt)
                        : "未产生记录"}
                    </dd>
                  </div>
                </dl>

                <Button
                  className="w-full"
                  intent={selected ? "primary" : "secondary"}
                  onClick={() => void onSelectPatient(patient.id)}
                >
                  <span className="inline-flex items-center gap-2">
                    <UserRoundCheck className="h-5 w-5" aria-hidden="true" />
                    查看
                  </span>
                </Button>
              </article>
            );
          })}
        </div>
      ) : null}

      {loadedPatients.length ? (
        <div className="mt-5 hidden overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line-strong)] md:block">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.15fr_0.8fr_1fr_1fr_0.7fr] gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4 text-xs font-black text-[var(--accent-strong)]">
              <span>患者</span>
              <span>风险</span>
              <span>方案</span>
              <span>最近训练</span>
              <span>操作</span>
            </div>
            {loadedPatients.map((patient) => {
              const risk = currentRisk(patient);
              const plan = currentPlan(patient);
              const latestTraining = patient.trainingSessions?.[0];
              const selected = selectedPatientId === patient.id;

              return (
                <div
                  key={patient.id}
                  className={[
                    "grid grid-cols-[1.15fr_0.8fr_1fr_1fr_0.7fr] items-center gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4 text-sm font-bold last:border-b-0",
                    selected ? "bg-[var(--surface-muted)]" : "",
                  ].join(" ")}
                >
                  <span>
                    <span className="block text-base font-black text-[var(--ink-strong)]">
                      {patient.name}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--ink-subtle)]">
                      {patient.age}岁 · 档案号 {shortId(patient.id)}
                    </span>
                  </span>
                  <StatusBadge status={riskStatus(risk?.riskLevel)}>
                    {riskLabel(risk?.riskLevel)}
                  </StatusBadge>
                  <span className="text-[var(--ink-soft)]">
                    {plan ? planStatusLabel(plan.status) : "未确认方案"}
                  </span>
                  <span className="text-[var(--ink-soft)]">
                    {latestTraining
                      ? formatDateTime(latestTraining.startedAt)
                      : "未产生记录"}
                  </span>
                  <Button
                    intent={selected ? "primary" : "secondary"}
                    onClick={() => void onSelectPatient(patient.id)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <UserRoundCheck className="h-5 w-5" aria-hidden="true" />
                      查看
                    </span>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : patientsUnavailable ? (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 font-bold leading-7 text-[var(--warning)]">
          授权患者列表未加载，暂时无法显示负责患者。
        </div>
      ) : (
        <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-paper)] p-5 font-bold leading-7 text-[var(--ink-subtle)]">
          当前账号没有负责患者档案。
        </div>
      )}
    </Card>
  );
}

function currentRisk(patient: PatientProfile): RiskGrade | undefined {
  return patient.riskGrades.find((risk) => risk.isCurrent);
}

function currentPlan(patient: PatientProfile): RehabPlan | undefined {
  return (
    patient.rehabPlans.find(
      (plan) => plan.isCurrent && plan.status === "active",
    ) ??
    patient.rehabPlans.find(
      (plan) => plan.status === "pending_confirm" && !plan.isCurrent,
    )
  );
}

function riskStatus(level?: RiskGrade["riskLevel"]) {
  if (level === "high") return "blocked";
  if (level === "moderate") return "pending";
  if (level === "low") return "complete";
  return "review";
}

function riskLabel(level?: RiskGrade["riskLevel"]) {
  if (level === "high") return "高风险";
  if (level === "moderate") return "中风险";
  if (level === "low") return "低风险";
  return "未评级";
}

function planStatusLabel(status: string) {
  if (status === "draft") return "草稿";
  if (status === "pending_confirm") return "待医师确认";
  if (status === "active") return "执行中";
  if (status === "paused") return "已暂停";
  if (status === "ended") return "已结束";
  return status;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDateTime(value?: string | null) {
  if (!value) return "未产生记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
