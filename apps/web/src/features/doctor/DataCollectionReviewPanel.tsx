"use client";

import { ClipboardCheck, Database, Radar } from "lucide-react";
import type {
  CollectionBatch,
  CollectionCondition,
  CollectionProtocol,
  RehabPlanItem,
} from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  doctorTrainingCategoryLabel,
  readConditionSnapshot,
} from "./doctor-workbench-model";

export type DataCollectionBatchFormState = {
  planItemId: string;
  protocolId: string;
  operatorNotes: string;
};

type DataCollectionReviewPanelProps = {
  batchesAvailable: boolean;
  currentPlanName?: string;
  planItems: RehabPlanItem[];
  selectedPlanItem?: RehabPlanItem;
  matchingProtocols?: CollectionProtocol[];
  readyBatch?: CollectionBatch;
  form: DataCollectionBatchFormState;
  onChange: <K extends keyof DataCollectionBatchFormState>(
    field: K,
    value: DataCollectionBatchFormState[K],
  ) => void;
  onCreateCollectionBatch: (form: DataCollectionBatchFormState) => Promise<void>;
  isBusy: boolean;
};

export function DataCollectionReviewPanel({
  batchesAvailable,
  currentPlanName,
  planItems,
  selectedPlanItem,
  matchingProtocols,
  readyBatch,
  form,
  onChange,
  onCreateCollectionBatch,
  isBusy,
}: DataCollectionReviewPanelProps) {
  const protocolsUnavailable = matchingProtocols === undefined;
  const loadedProtocols = matchingProtocols ?? [];
  const selectedProtocol = loadedProtocols.find(
    (protocol) => protocol.id === form.protocolId,
  );
  const summaryProtocol = selectedProtocol ?? readyBatch?.protocol;
  const summaryCondition =
    summaryProtocol?.condition ?? readyBatch?.condition ?? readConditionSnapshot(readyBatch);
  const selectedCategory = selectedPlanItem
    ? doctorTrainingCategoryLabel([
        ...selectedPlanItem.gameContent.trainingTargets,
        ...selectedPlanItem.gameContent.tags,
      ])
    : "待选择项目";
  const canSubmit = Boolean(
    batchesAvailable &&
      !protocolsUnavailable &&
      currentPlanName &&
      selectedPlanItem &&
      selectedProtocol &&
      !readyBatch &&
      !isBusy,
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    void onCreateCollectionBatch(form);
  }

  return (
    <Card tone="workbench" className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-black text-[var(--accent-strong)]">
            <Radar className="h-4 w-4" aria-hidden="true" />
            患者训练准备
          </div>
          <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
            创建训练准备记录
          </h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            医师为当前患者的生效方案选择训练项目和训练准备规则。创建后患者端才允许在设备检查通过后开始本次训练。
          </p>
        </div>
        <StatusBadge status={readyBatch ? "complete" : protocolsUnavailable || !batchesAvailable ? "review" : loadedProtocols.length ? "pending" : "review"}>
          {protocolsUnavailable
            ? "训练准备协议未加载"
            : !batchesAvailable
              ? "训练准备记录未加载"
              : readyBatch
                ? "已准备"
                : loadedProtocols.length
                  ? "待创建"
                  : "待维护规则"}
        </StatusBadge>
      </div>

      {!currentPlanName ? (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 font-bold leading-7 text-[var(--warning-strong)]">
          当前患者还没有生效康复方案。请先在计划管理中确认方案，再创建训练准备记录。
        </div>
      ) : null}
      {protocolsUnavailable ? (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 font-bold leading-7 text-[var(--warning-strong)]">
          训练准备协议未加载，暂时无法选择训练准备规则。
        </div>
      ) : null}
      {!batchesAvailable ? (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 font-bold leading-7 text-[var(--warning-strong)]">
          训练准备记录未加载，暂时无法判断当前项目是否已准备。
        </div>
      ) : null}

      <form onSubmit={submit}>
        <fieldset
          disabled={!currentPlanName || isBusy}
          className="mt-5 grid gap-x-4 disabled:opacity-60 md:grid-cols-3"
        >
          <SelectField
            label="当前方案训练项目"
            value={form.planItemId}
            onChange={(value) => {
              onChange("planItemId", value);
              onChange("protocolId", "");
            }}
            options={[
              ["", "请选择训练项目"],
              ...planItems.map((item) => [
                item.id,
                `${item.gameContent.name} · ${doctorTrainingCategoryLabel([
                  ...item.gameContent.trainingTargets,
                  ...item.gameContent.tags,
                ])}`,
              ] as [string, string]),
            ]}
          />
          <SelectField
            label="训练准备规则"
            value={form.protocolId}
            disabled={!selectedPlanItem || protocolsUnavailable || !loadedProtocols.length}
            onChange={(value) => onChange("protocolId", value)}
            options={[
              ["", protocolsUnavailable ? "训练准备协议未加载" : loadedProtocols.length ? "请选择准备规则" : "暂无匹配规则"],
              ...loadedProtocols.map((protocol) => [
                protocol.id,
                doctorPreparationProtocolOptionLabel(selectedCategory, protocol),
              ] as [string, string]),
            ]}
          />
          <FieldLine
            label="医师准备说明"
            value={form.operatorNotes}
            onChange={(value) => onChange("operatorNotes", value)}
          />
        </fieldset>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <EvidenceTile
            label="当前方案"
            value={currentPlanName ?? "暂无生效方案"}
          />
          <EvidenceTile
            label="训练类型"
            value={selectedCategory}
          />
          <EvidenceTile label="训练准备" value={!batchesAvailable ? "未加载" : readyBatch ? "已完成" : "待创建"} />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <CollectionSummaryCard
            title="设备要求"
            icon={<Database className="h-5 w-5" aria-hidden="true" />}
            rows={[
              [
                "准备规则",
                doctorPreparationConditionLabel(
                  selectedCategory,
                  Boolean(summaryCondition || summaryProtocol),
                ),
              ],
              ["设备要求", summaryCondition ? "需患者端完成" : "待选择规则"],
              ["站位与空间", doctorPreparationSpaceLabel(summaryCondition)],
            ]}
          />
          <CollectionSummaryCard
            title="训练安排"
            icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />}
            rows={[
              ["训练项目", selectedPlanItem?.gameContent.name ?? "待选择项目"],
              ["训练类型", selectedCategory],
              ["准备记录", doctorPreparationRuleLabel(selectedCategory, Boolean(summaryProtocol))],
              ["准备方式", summaryProtocol ? "按训练项目前检查" : "待选择规则"],
            ]}
          />
          <CollectionSummaryCard
            title="训练质量"
            icon={<Radar className="h-5 w-5" aria-hidden="true" />}
            rows={[
              ["准备状态", readyBatch ? readyBatchStatusLabel(readyBatch.status) : "待创建"],
              ["准备说明", (readyBatch?.operatorNotes ?? form.operatorNotes) || "暂无备注"],
              ["训练前检查", readyBatch ? "患者训练前将按规则检查" : "创建后进入患者准备流程"],
              ["创建时间", formatDateTime(readyBatch?.createdAt)],
            ]}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-muted)] p-5">
          <p className="max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            已存在准备记录时不会重复创建。若训练项目缺少准备规则，请先由运营人员维护正式训练准备规则。
          </p>
          <Button disabled={!canSubmit} isLoading={isBusy} type="submit">
            {readyBatch ? "已完成准备" : "创建训练准备记录"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function doctorPreparationRuleLabel(category: string, hasRule: boolean) {
  if (!hasRule) return "待选择规则";
  if (category === "思维训练") return "思维训练准备规则";
  if (category === "运动训练") return "运动训练准备规则";
  return "训练准备规则";
}

export function doctorPreparationProtocolOptionLabel(
  category: string,
  protocol: Pick<CollectionProtocol, "version">,
) {
  return `${doctorPreparationRuleLabel(category, true)} · ${protocol.version}`;
}

export function doctorPreparationConditionLabel(
  category: string,
  hasRequirement: boolean,
) {
  if (!hasRequirement) return "待选择规则";
  if (category === "思维训练") return "认知训练环境要求";
  if (category === "运动训练") {
    return "运动训练环境与设备要求";
  }
  return "训练环境与设备要求";
}

function doctorPreparationSpaceLabel(condition?: CollectionCondition | null) {
  const description = condition?.description?.trim();
  if (
    !description ||
    !/空间|站位|设备|摄像头|安静|桌面|光线|陪护|安全|环境/.test(description)
  ) {
    return "按训练项目要求确认";
  }
  return description;
}

function CollectionSummaryCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<[string, string]>;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4">
      <div className="flex items-center gap-2 text-[var(--accent-strong)]">
        {icon}
        <h4 className="font-black text-[var(--ink-strong)]">{title}</h4>
      </div>
      <dl className="mt-4 grid gap-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-2"
          >
            <dt className="text-xs font-black text-[var(--ink-subtle)]">{label}</dt>
            <dd className="mt-1 break-words text-sm font-black text-[var(--ink-strong)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EvidenceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] p-5">
      <p className="text-sm font-black text-[var(--ink-subtle)]">{label}</p>
      <p className="mt-3 text-2xl font-black text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function FieldLine({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 font-mono text-lg font-bold outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-paper)] px-4 py-4 font-mono text-lg font-bold outline-none transition disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-soft)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDateTime(value?: string | null) {
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

function readyBatchStatusLabel(status: string) {
  if (status === "ready") return "已准备";
  if (status === "in_progress") return "训练中";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "需确认";
}
