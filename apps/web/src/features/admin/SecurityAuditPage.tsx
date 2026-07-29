"use client";

import { ShieldCheck } from "lucide-react";
import { FormEvent } from "react";
import type { AuditLog, AuditLogFilters, RoleCode } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type SecurityAuditPageProps = {
  auditLogs?: AuditLog[];
  canReadAuditLogs: boolean;
  filters: AuditLogFilters;
  isLoading: boolean;
  onFiltersChange: (
    field: keyof AuditLogFilters,
    value: AuditLogFilters[keyof AuditLogFilters],
  ) => void;
  onRefreshAuditLogs: (filters: AuditLogFilters) => Promise<void>;
};

const resultOptions: Array<[NonNullable<AuditLogFilters["result"]>, string]> = [
  ["all", "全部结果"],
  ["success", "成功"],
  ["denied", "拒绝"],
  ["failed", "失败"],
];

const actorRoleOptions: Array<["all" | RoleCode, string]> = [
  ["all", "全部角色"],
  ["patient", "患者"],
  ["caregiver", "家属"],
  ["doctor", "医师"],
  ["admin", "管理员"],
  ["admin_super", "平台管理人员"],
  ["admin_operator", "普通运营"],
  ["admin_auditor", "审计查看人员"],
];

const actionOptions: Array<[string, string]> = [
  ["", "全部动作"],
  ["auth.login", "账号登录"],
  ["user.create.caregiver", "创建家属账号"],
  ["registration.review", "账号审核"],
  ["assessment.review", "评估风险确认"],
  ["rehab_plan.confirm", "康复计划确认"],
  ["collection_batch.create", "训练准备创建"],
  ["training_session.start", "训练开始"],
  ["training_result.submit", "训练结果提交"],
  ["training_result.review", "训练结果复核"],
  ["game_content.create", "创建训练内容"],
  ["game_content.update_unity_build", "更新训练资源"],
  ["game_content.publish_unity_build", "发布训练资源"],
  ["collection_condition.create", "创建采集条件"],
  ["collection_protocol.create", "创建采集协议"],
  ["data.export", "脱敏数据导出"],
  ["access.denied", "访问被拒绝"],
];

const targetTypeOptions: Array<[string, string]> = [
  ["", "全部目标"],
  ["user", "用户"],
  ["registration_request", "账号申请"],
  ["patient_profile", "患者档案"],
  ["assessment_record", "评估记录"],
  ["rehab_plan", "康复计划"],
  ["collection_batch", "训练准备"],
  ["training_session", "训练会话"],
  ["training_result", "训练结果"],
  ["game_content", "训练内容"],
  ["collection_condition", "采集条件"],
  ["collection_protocol", "采集协议"],
  ["data_export", "数据导出"],
];

export function SecurityAuditPage({
  auditLogs,
  canReadAuditLogs,
  filters,
  isLoading,
  onFiltersChange,
  onRefreshAuditLogs,
}: SecurityAuditPageProps) {
  const attentionCount = auditLogs?.filter(
    (log) => log.result === "denied" || log.result === "failed",
  ).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReadAuditLogs || isLoading) return;
    void onRefreshAuditLogs(filters);
  }

  return (
    <Card tone="governance" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge status={canReadAuditLogs ? "complete" : "review"}>
            审计日志
          </StatusBadge>
          <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
            审计日志筛选
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            按操作者、角色、动作、目标和时间范围追溯关键治理操作。
          </p>
        </div>
        <ShieldCheck
          aria-hidden="true"
          className="h-5 w-5 text-[var(--accent-strong)]"
        />
      </div>

      {!canReadAuditLogs ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--warning)]">
          当前账号没有审计日志查询权限。
        </p>
      ) : null}

      <form onSubmit={submit}>
        <fieldset
          className="grid gap-4 disabled:opacity-60 md:grid-cols-4"
          disabled={!canReadAuditLogs || isLoading}
        >
          <SelectInput
            label="结果"
            onChange={(value) =>
              onFiltersChange(
                "result",
                value as NonNullable<AuditLogFilters["result"]>,
              )
            }
            options={resultOptions}
            value={filters.result ?? "all"}
          />
          <SelectInput
            label="操作者角色"
            onChange={(value) =>
              onFiltersChange("actorRole", value as "all" | RoleCode)
            }
            options={actorRoleOptions}
            value={filters.actorRole ?? "all"}
          />
          <SelectInput
            label="动作"
            onChange={(value) => onFiltersChange("action", value)}
            options={actionOptions}
            value={filters.action ?? ""}
          />
          <SelectInput
            label="目标类型"
            onChange={(value) => onFiltersChange("targetType", value)}
            options={targetTypeOptions}
            value={filters.targetType ?? ""}
          />
          <TextInput
            label="操作者账号"
            onChange={(value) => onFiltersChange("actorAccount", value)}
            value={filters.actorAccount ?? ""}
          />
          <TextInput
            label="对象编号"
            onChange={(value) => onFiltersChange("targetId", value)}
            value={filters.targetId ?? ""}
          />
          <TextInput
            label="开始时间"
            onChange={(value) => onFiltersChange("dateFrom", value)}
            type="datetime-local"
            value={filters.dateFrom ?? ""}
          />
          <TextInput
            label="结束时间"
            onChange={(value) => onFiltersChange("dateTo", value)}
            type="datetime-local"
            value={filters.dateTo ?? ""}
          />
          <TextInput
            label="返回条数"
            onChange={(value) =>
              onFiltersChange("limit", value ? Number(value) : undefined)
            }
            type="number"
            value={String(filters.limit ?? "")}
          />
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line-subtle)] pt-4">
          {auditLogs ? (
            <p className="max-w-3xl text-sm font-bold leading-6 text-[var(--ink-soft)]">
              本次查询返回 {auditLogs.length} 条记录，其中 {attentionCount} 条需要关注。
            </p>
          ) : null}
          <Button
            disabled={!canReadAuditLogs}
            isLoading={isLoading}
            type="submit"
          >
            查询审计日志
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line-strong)]">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[1fr_1fr_1.2fr_1fr_0.7fr] gap-3 border-b border-[var(--line-subtle)] bg-[var(--surface-muted)] p-3 text-xs font-black text-[var(--ink-subtle)]">
            <span>时间</span>
            <span>操作者</span>
            <span>动作</span>
            <span>目标</span>
            <span>结果</span>
          </div>
          {auditLogs?.map((log) => (
            <div
              key={log.id}
              className="grid grid-cols-[1fr_1fr_1.2fr_1fr_0.7fr] gap-3 border-b border-[var(--line-subtle)] p-3 text-sm font-bold text-[var(--ink-soft)] last:border-b-0"
            >
              <span>{formatDateTime(log.createdAt)}</span>
              <span className="min-w-0">
                <span className="block truncate">
                  {log.actor?.displayName ?? roleLabel(log.actorRole) ?? "系统"}
                </span>
                {log.actor?.account ? (
                  <span className="block truncate text-xs text-[var(--ink-subtle)]">
                    {log.actor.account}
                  </span>
                ) : null}
              </span>
              <span>{actionLabel(log.action)}</span>
              <span className="min-w-0 truncate">
                {targetTypeLabel(log.targetType)}
                {log.targetId ? ` · ${shortId(log.targetId)}` : ""}
              </span>
              <span>
                <StatusBadge status={resultStatus(log.result)}>
                  {resultLabel(log.result)}
                </StatusBadge>
              </span>
            </div>
          ))}
          {auditLogs?.length === 0 ? (
            <p className="p-5 text-center text-sm font-bold text-[var(--ink-subtle)]">
              当前筛选条件下没有审计日志。
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function TextInput({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <select
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function actionLabel(action: string) {
  return actionOptions.find(([value]) => value === action)?.[1] ?? action;
}

function targetTypeLabel(targetType: string) {
  return (
    targetTypeOptions.find(([value]) => value === targetType)?.[1] ?? targetType
  );
}

function roleLabel(role?: RoleCode | null) {
  if (!role) return null;
  return actorRoleOptions.find(([value]) => value === role)?.[1] ?? role;
}

function resultLabel(result: AuditLog["result"]) {
  if (result === "success") return "成功";
  if (result === "denied") return "拒绝";
  return "失败";
}

function resultStatus(result: AuditLog["result"]) {
  if (result === "success") return "complete";
  if (result === "denied") return "blocked";
  return "pending";
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
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
