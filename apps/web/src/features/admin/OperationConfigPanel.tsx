"use client";

import { SlidersHorizontal } from "lucide-react";
import type {
  CollectionCondition,
  CollectionProtocol,
  GameContent,
} from "@/types/api";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

type OperationConfigPanelProps = {
  collectionConditions?: CollectionCondition[];
  collectionProtocols?: CollectionProtocol[];
  gameContents?: GameContent[];
};

export function OperationConfigPanel({
  collectionConditions,
  collectionProtocols,
  gameContents,
}: OperationConfigPanelProps) {
  const gameContentsUnavailable = gameContents === undefined;
  const collectionConditionsUnavailable = collectionConditions === undefined;
  const collectionProtocolsUnavailable = collectionProtocols === undefined;
  const games = gameContents ?? [];
  const conditions = collectionConditions ?? [];
  const protocols = collectionProtocols ?? [];
  const releasedGames = games.filter(isReleasedGameContent);
  const protocolReadyCount = protocols.filter(
    (protocol) => protocol.status === "active",
  ).length;

  return (
    <Card tone="governance" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge status="ready">配置治理</StatusBadge>
          <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
            基础运营配置
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            汇总训练内容、采集条件和协议准备状态，帮助运营判断是否可以进入正式训练安排。
          </p>
        </div>
        <SlidersHorizontal
          aria-hidden="true"
          className="h-5 w-5 text-[var(--accent-strong)]"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCell label="训练内容" value={gameContentsUnavailable ? "未加载" : `${games.length} 个`} />
        <SummaryCell label="已发布内容" value={gameContentsUnavailable ? "未加载" : `${releasedGames.length} 个`} />
        <SummaryCell label="采集条件" value={collectionConditionsUnavailable ? "未加载" : `${conditions.length} 个`} />
        <SummaryCell label="可用协议" value={collectionProtocolsUnavailable ? "未加载" : `${protocolReadyCount} 个`} />
      </div>

      {gameContentsUnavailable ? <UnavailableConfigNotice>训练内容未加载，暂时无法显示内容配置状态。</UnavailableConfigNotice> : null}
      {collectionConditionsUnavailable ? <UnavailableConfigNotice>采集条件未加载，暂时无法显示条件配置状态。</UnavailableConfigNotice> : null}

      <div className="grid gap-3">
        {protocols.slice(0, 5).map((protocol) => (
          <div
            key={protocol.id}
            className="border-b border-[var(--line-subtle)] pb-3 last:border-b-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-black text-[var(--ink-strong)]">
                {protocol.name}
              </strong>
              <StatusBadge
                status={protocol.status === "active" ? "complete" : "review"}
              >
                {protocolStatusLabel(protocol.status)}
              </StatusBadge>
            </div>
            <p className="mt-1 text-sm font-bold leading-6 text-[var(--ink-soft)]">
              {runtimeLabel(protocol.runtimeType)} · {protocol.version} · {protocol.condition?.name ?? protocol.conditionId}
            </p>
          </div>
        ))}
        {collectionProtocolsUnavailable ? (
          <UnavailableConfigNotice>采集协议未加载，暂时无法显示协议状态。</UnavailableConfigNotice>
        ) : !protocols.length ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] p-4 text-center text-sm font-bold text-[var(--ink-subtle)]">
            暂无采集协议。请先创建采集条件并绑定已发布训练内容。
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function UnavailableConfigNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-center text-sm font-bold text-[var(--warning)]">
      {children}
    </p>
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

function isReleasedGameContent(game: GameContent) {
  return game.status === "active" && game.buildStatus === "released";
}

function protocolStatusLabel(status: CollectionProtocol["status"]) {
  if (status === "active") return "可用于训练准备";
  if (status === "deprecated") return "已停用";
  return "待启用";
}

function runtimeLabel(runtimeType: GameContent["runtimeType"]) {
  if (runtimeType === "browser_pose_canvas") return "浏览器体感";
  if (runtimeType === "cognitive_web") return "认知训练";
  return "外部训练资源";
}
