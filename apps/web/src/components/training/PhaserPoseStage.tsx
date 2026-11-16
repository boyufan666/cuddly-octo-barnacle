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

      // Gameplay targets are drawn exclusively by the live target overlay.
      const wave = this.add.rectangle(
        width / 2,
        height - 42,
        width * 0.72,
        4,
        palette.stroke,
        0.5,
      );
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
    marker: cssColorToPhaserNumber(
      readCssToken(host, tokenSet.marker),
      tokenSet.marker,
    ),
    stroke: cssColorToPhaserNumber(
      readCssToken(host, tokenSet.stroke),
      tokenSet.stroke,
    ),
    text: readCssToken(host, tokenSet.text),
  };
}

function readCssToken(host: HTMLDivElement, tokenName: string) {
  const tokenValue = getComputedStyle(host).getPropertyValue(tokenName).trim();
  if (!tokenValue) {
    throw new Error(
      `Missing design token ${tokenName} for Phaser training stage.`,
    );
  }
  return tokenValue;
}

export function cssColorToPhaserNumber(cssColor: string, tokenName: string) {
  if (
    !CSS.supports("color", cssColor) ||
    /currentcolor|inherit|initial|unset|revert|var\(|env\(|light-dark\(/i.test(
      cssColor,
    )
  ) {
    throw new Error(
      `Invalid design token ${tokenName} for Phaser training stage.`,
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Cannot resolve design colors for Phaser training stage.");
  }
  context.fillStyle = cssColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha !== 255) {
    throw new Error(
      `Design token ${tokenName} must be an opaque color for Phaser training stage.`,
    );
  }
  return red * 65536 + green * 256 + blue;
}

function resolveStageLabel(
  profile: BrowserPoseGameDefinition["scoringProfile"],
) {
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

function resolveStageRunningCopy(
  profile: BrowserPoseGameDefinition["scoringProfile"],
) {
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
