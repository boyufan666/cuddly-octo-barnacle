export function browserPoseContentRect(
  stageWidth: number,
  stageHeight: number,
  videoWidth: number,
  videoHeight: number,
) {
  if (
    [stageWidth, stageHeight, videoWidth, videoHeight].some(
      (value) => !Number.isFinite(value) || value <= 0,
    )
  )
    return undefined;
  const scale = Math.min(stageWidth / videoWidth, stageHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: (stageWidth - width) / 2,
    top: (stageHeight - height) / 2,
    width,
    height,
  };
}
