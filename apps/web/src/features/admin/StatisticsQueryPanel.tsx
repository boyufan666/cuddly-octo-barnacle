"use client";

import { BarChart3 } from "lucide-react";
import type { AdminDashboardResponse } from "@/types/api";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type StatisticsQueryPanelProps = {
  dashboard?: AdminDashboardResponse;
};

export function StatisticsQueryPanel({ dashboard }: StatisticsQueryPanelProps) {
  const auditRows = dashboard?.distributions.auditResults ?? [];
  const qualityRows = dashboard?.distributions.qualityFlags ?? [];

  return (
    <Card tone="governance" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge status={dashboard ? "complete" : "review"}>
            查询统计
          </StatusBadge>
          <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
            运营指标查询
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            使用后端返回的治理统计，查看训练、方案、授权、审计和质量分布。
          </p>
        </div>
        <BarChart3
          aria-hidden="true"
          className="h-5 w-5 text-[var(--accent-strong)]"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCell label="用户账号" value={metric(dashboard?.metrics.users)} />
        <SummaryCell label="患者档案" value={metric(dashboard?.metrics.patients)} />
        <SummaryCell
          label="今日训练"
          value={metric(dashboard?.overview.todayTrainings)}
        />
        <SummaryCell
          label="异常结果"
          value={metric(dashboard?.metrics.abnormalResults)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionBlock
          emptyText="暂无训练质量统计"
          labels={{ suspicious: "需关注", valid: "有效数据" }}
          rows={qualityRows}
          title="训练质量"
        />
        <DistributionBlock
          emptyText="暂无审计结果统计"
          labels={{ denied: "拒绝", failed: "失败", success: "成功" }}
          rows={auditRows}
          title="审计结果"
        />
      </div>
    </Card>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--line-subtle)] pt-3">
      <p className="text-xs font-black text-[var(--ink-subtle)]">{label}</p>
      <p className="mt-1 text-lg font-black text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function DistributionBlock({
  emptyText,
  labels,
  rows,
  title,
}: {
  emptyText: string;
  labels: Record<string, string>;
  rows: Array<{ count: number; key: string }>;
  title: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section className="min-w-0">
      <h4 className="text-sm font-black text-[var(--ink-strong)]">{title}</h4>
      <div className="mt-3 grid gap-3">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between gap-3 text-sm font-bold text-[var(--ink-soft)]">
                <span>{labels[row.key] ?? row.key}</span>
                <span>{row.count}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-muted)]">
                <div
                  className="h-full rounded-[var(--radius-control)] bg-[var(--accent-strong)]"
                  style={{
                    width: total ? `${Math.max((row.count / total) * 100, 6)}%` : "0%",
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] p-4 text-center text-sm font-bold text-[var(--ink-subtle)]">
            {emptyText}
          </p>
        )}
      </div>
    </section>
  );
}

function metric(value?: number) {
  return typeof value === "number" ? String(value) : "待加载";
}
