"use client";

import { useEffect, useRef, useState } from "react";
import type { BrowserPoseGameDefinition } from "@/lib/browser-pose-game-library";
import { cn } from "@/lib/utils";

type PhaserPoseStageProps = {
  gameName: string;
  profile: BrowserPoseGameDefinition["scoringProfile"];
  phase: "idle" | "loading" | "running" | "completed" | "error";
  onReady: () => void;
  onError: (message: string) => void;
};

type PhaserRuntime = typeof import("phaser");

const transparentStageBackground = "transparent";

const stageColorTokens = {
  reaction_reach: {
    marker: "--accent-soft-strong",
    stroke: "--accent-soft",
    text: "--ink-inverse",
  },
  memory_sequence: {
    marker: "--warning-line",
    stroke: "--accent-soft-strong",
    text: "--ink-inverse",
  },
  selective_sort: {
    marker: "--danger-line",
    stroke: "--accent-soft-strong",
    text: "--ink-inverse",
  },
  steady_breath: {
    marker: "--success-line",
    stroke: "--line-info",
    text: "--ink-inverse",
  },
  bilateral_coordination: {
    marker: "--warning-line",
    stroke: "--line-info",
    text: "--ink-inverse",
  },
  trajectory_tracking: {
    marker: "--accent-soft-strong",
    stroke: "--warning-line",
    text: "--ink-inverse",
  },
  balance_shift: {
    marker: "--line-info",
    stroke: "--warning-line",
    text: "--ink-inverse",
  },
} satisfies Record<
  BrowserPoseGameDefinition["scoringProfile"],
  {
    marker: string;
    stroke: string;
    text: string;
  }
>;

export function PhaserPoseStage({
  gameName,
  profile,
  phase,
  onReady,
  onError,
}: PhaserPoseStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({ onReady, onError });
  const stageKey = `${gameName}:${profile}`;
  const [readyStageKey, setReadyStageKey] = useState<string | null>(null);
  const ready = readyStageKey === stageKey;

  useEffect(() => {
    callbacksRef.current = { onReady, onError };
  }, [onReady, onError]);

  useEffect(() => {
    let cancelled = false;
    let game: import("phaser").Game | null = null;

    async function mountPhaserStage() {
      if (!hostRef.current) return;
      try {
        const Phaser = await import("phaser");
        if (cancelled || !hostRef.current) return;
        const mountedGame = createPhaserStage({
          Phaser,
          host: hostRef.current,
          gameName,
          profile,
          onSceneReady: () => {
            if (cancelled) return;
            setReadyStageKey(stageKey);
            callbacksRef.current.onReady();
          },
        });
        if (cancelled) {
          mountedGame.destroy(true);
          return;
        }
        game = mountedGame;
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "训练舞台加载失败，不能开始本次训练。";
        callbacksRef.current.onError(message);
      }
    }

    const mountFrame = window.requestAnimationFrame(() => {
      void mountPhaserStage();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(mountFrame);
      game?.destroy(true);
      game = null;
    };
  }, [gameName, profile, stageKey]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 transition-opacity duration-300",
        ready ? "opacity-100" : "opacity-0",
      )}
      aria-hidden="true"
    >
      <div ref={hostRef} className="h-full w-full" />
      <div className="absolute left-5 top-5 max-w-[min(360px,calc(100%-2.5rem))] rounded-[var(--radius-card)] border border-[var(--line-inverse)] bg-[var(--ink-strong)] px-4 py-3 text-sm font-black text-[var(--ink-inverse-soft)]">
        <span className="block text-xs text-[var(--accent-soft-strong)]">
          {resolveStageLabel(profile)}
        </span>
        <span className="mt-1 block">
          {phase === "running"
            ? resolveStageRunningCopy(profile)
            : "训练画面已就绪"}
        </span>
      </div>
    </div>
  );
}

function createPhaserStage({
  Phaser,
  host,
  gameName,
  profile,
  onSceneReady,
}: {
  Phaser: PhaserRuntime;
  host: HTMLDivElement;
  gameName: string;
  profile: BrowserPoseGameDefinition["scoringProfile"];
  onSceneReady: () => void;
}) {
  const palette = resolveStagePalette(profile, host);
  let sceneReadyReported = false;

  class PoseStageScene extends Phaser.Scene {
    create() {
      const width = this.scale.width;
      const height = this.scale.height;
      this.cameras.main.setBackgroundColor(palette.background);

      const title = this.add.text(32, 30, gameName, {
        color: palette.text,
        fontFamily: "Georgia, serif",
        fontSize: "26px",
        fontStyle: "bold",
      });
      title.setAlpha(0.9);

      if (profile === "trajectory_tracking") {
        const points = [
          { x: width * 0.18, y: height * 0.58 },
          { x: width * 0.34, y: height * 0.38 },
          { x: width * 0.56, y: height * 0.5 },
          { x: width * 0.78, y: height * 0.3 },
        ];
        const trace = this.add.graphics();
        trace.lineStyle(9, palette.marker, 0.2);
        trace.beginPath();
        trace.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => trace.lineTo(point.x, point.y));
        trace.strokePath();
        trace.lineStyle(3, palette.stroke, 0.82);
        trace.beginPath();
        trace.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => trace.lineTo(point.x, point.y));
        trace.strokePath();

        points.forEach((point, index) => {
          const checkpoint = this.add.ellipse(
            point.x,
            point.y,
            34,
            34,
            index === 0 ? palette.stroke : palette.marker,
            0.28,
          );
          checkpoint.setStrokeStyle(3, index === 0 ? palette.stroke : palette.marker, 0.9);
          this.add.text(point.x - 6, point.y - 10, String(index + 1), {
            color: palette.text,
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: "16px",
            fontStyle: "bold",
          });
          this.tweens.add({
            targets: checkpoint,
            alpha: { from: 0.35, to: 0.86 },
            scale: { from: 0.92, to: 1.2 },
            duration: 1300 + index * 180,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        });

        const tracer = this.add.ellipse(points[0].x, points[0].y, 20, 20, palette.stroke, 0.88);
        this.tweens.add({
          targets: tracer,
          x: points.map((point) => point.x),
          y: points.map((point) => point.y),
          duration: 3600,
          repeat: -1,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
      }

      if (profile === "balance_shift") {
        const balanceRail = this.add.graphics();
        balanceRail.lineStyle(10, palette.marker, 0.18);
        balanceRail.beginPath();
        balanceRail.moveTo(width * 0.18, height * 0.56);
        balanceRail.lineTo(width * 0.5, height * 0.42);
        balanceRail.lineTo(width * 0.82, height * 0.56);
        balanceRail.strokePath();
        balanceRail.lineStyle(3, palette.stroke, 0.86);
        balanceRail.beginPath();
        balanceRail.moveTo(width * 0.18, height * 0.56);
        balanceRail.lineTo(width * 0.5, height * 0.42);
        balanceRail.lineTo(width * 0.82, height * 0.56);
        balanceRail.strokePath();

        const centerline = this.add.rectangle(
          width * 0.5,
          height * 0.5,
          4,
          height * 0.58,
          palette.stroke,
          0.54,
        );
        centerline.setStrokeStyle(1, palette.stroke, 0.5);

        const bridgeTargets = [
          { x: width * 0.22, y: height * 0.56, label: "左" },
          { x: width * 0.5, y: height * 0.42, label: "中" },
          { x: width * 0.78, y: height * 0.56, label: "右" },
        ];
        bridgeTargets.forEach((point, index) => {
          const star = this.add.star(
            point.x,
            point.y,
            5,
            18,
            34,
            index === 1 ? palette.stroke : palette.marker,
            0.72,
          );
          star.setStrokeStyle(3, palette.stroke, 0.82);
          this.add.text(point.x - 10, point.y + 42, point.label, {
            color: palette.text,
            fontFamily: "Georgia, serif",
            fontSize: "20px",
            fontStyle: "bold",
          });
          this.tweens.add({
            targets: star,
            alpha: { from: 0.46, to: 0.92 },
            scale: { from: 0.88, to: 1.16 },
            duration: 1200 + index * 180,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        });
      }

      for (let index = 0; index < 9; index += 1) {
        const guideRing = this.add.ellipse(
          width * (0.18 + (index % 3) * 0.32),
          height * (0.32 + Math.floor(index / 3) * 0.22),
          90 + index * 8,
          90 + index * 8,
          palette.marker,
          0.16,
        );
        guideRing.setStrokeStyle(2, palette.stroke, 0.28);
        this.tweens.add({
          targets: guideRing,
          alpha: { from: 0.2, to: 0.62 },
          scale: { from: 0.88, to: 1.08 },
          duration: 1800 + index * 120,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      const wave = this.add.rectangle(width / 2, height - 42, width * 0.72, 4, palette.stroke, 0.5);
      this.tweens.add({
        targets: wave,
        scaleX: { from: 0.72, to: 1 },
        alpha: { from: 0.35, to: 0.8 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      if (!sceneReadyReported) {
        sceneReadyReported = true;
        onSceneReady();
      }
    }
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: host.clientWidth || 960,
    height: host.clientHeight || 540,
    transparent: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      parent: host,
      width: "100%",
      height: "100%",
    },
    scene: PoseStageScene,
  });
}

function resolveStagePalette(
  profile: BrowserPoseGameDefinition["scoringProfile"],
  host: HTMLDivElement,
) {
  const tokenSet = stageColorTokens[profile];

  return {
    background: transparentStageBackground,
    marker: cssColorToPhaserNumber(readCssToken(host, tokenSet.marker), tokenSet.marker),
    stroke: cssColorToPhaserNumber(readCssToken(host, tokenSet.stroke), tokenSet.stroke),
    text: readCssToken(host, tokenSet.text),
  };
}

function readCssToken(host: HTMLDivElement, tokenName: string) {
  const tokenValue = getComputedStyle(host).getPropertyValue(tokenName).trim();
  if (!tokenValue) {
    throw new Error(`Missing design token ${tokenName} for Phaser training stage.`);
  }
  return tokenValue;
}

function cssColorToPhaserNumber(cssColor: string, tokenName: string) {
  const channels = cssColor.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    throw new Error(`Invalid design token ${tokenName} for Phaser training stage.`);
  }

  const [red, green, blue] = channels.map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel))),
  );
  return red * 65536 + green * 256 + blue;
}

function resolveStageLabel(profile: BrowserPoseGameDefinition["scoringProfile"]) {
  const labels = {
    reaction_reach: "反应触达",
    memory_sequence: "记忆序列",
    selective_sort: "分拣抗干扰",
    steady_breath: "呼吸稳定",
    bilateral_coordination: "双手节拍协同",
    trajectory_tracking: "轨迹追踪巡航",
    balance_shift: "重心转移星桥",
  } satisfies Record<BrowserPoseGameDefinition["scoringProfile"], string>;

  return labels[profile];
}

function resolveStageRunningCopy(profile: BrowserPoseGameDefinition["scoringProfile"]) {
  const copies = {
    reaction_reach: "反应目标出现后尽快触达",
    memory_sequence: "记住序列并按顺序触达",
    selective_sort: "只分拣目标，避开干扰",
    steady_breath: "跟随呼吸节律保持稳定",
    bilateral_coordination: "按节拍完成左右手协同",
    trajectory_tracking: "沿着光轨平稳追踪",
    balance_shift: "跟随星桥提示平稳转移重心，保持平衡",
  } satisfies Record<BrowserPoseGameDefinition["scoringProfile"], string>;

  return copies[profile];
}
