"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export type CheckPoseAction = (
  videoElement: HTMLVideoElement,
  signal?: AbortSignal,
) => Promise<void>;

/** The visible video is also the detector's input; no illustrative camera feed. */
export function PoseCheckPreview({
  onCheckPose,
  disabled,
  isChecking,
}: {
  onCheckPose: CheckPoseAction;
  disabled: boolean;
  isChecking: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      controllerRef.current?.abort();
      const stream = video?.srcObject;
      if (stream && "getTracks" in stream)
        stream.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  async function check() {
    if (!videoRef.current || disabled || isChecking) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setHasStarted(true);
    await onCheckPose(videoRef.current, controller.signal);
  }

  return (
    <div className="grid gap-3" data-testid="pose-check-preview">
      <div className="relative aspect-video overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--ink-strong)]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="站位检查摄像头实时画面"
          className="h-full w-full object-contain"
        />
        <p
          className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-center text-sm font-bold text-white"
          aria-live="polite"
        >
          {isChecking
            ? "正在读取摄像头画面，请让上半身进入画面。"
            : hasStarted
              ? "本次检查已结束，摄像头已关闭。"
              : "点击站位检查后，这里会显示真实摄像头画面。"}
        </p>
      </div>
      <Button
        intent="secondary"
        disabled={disabled || isChecking}
        isLoading={isChecking}
        onClick={() => void check()}
      >
        {disabled ? "先完成摄像头授权与检测" : "站位检查"}
      </Button>
    </div>
  );
}
