import { createRoot } from "react-dom/client";
import { BrowserPoseTrainingSurface } from "./BrowserPoseTrainingSurface";
import { getBrowserPoseGameDefinition } from "@/lib/browser-pose-game-library";
import type { RehabPlan, TrainingSession } from "@/types/api";
const codes = [
  "balance_breath",
  "orbital_trace_follow",
  "center_shift_bridge",
  "bilateral_rhythm_sync",
];
createRoot(document.getElementById("root")!).render(
  <>
    {codes.map((code) => (
      <section data-game-code={code} key={code}>
        <BrowserPoseTrainingSurface
          durationMinutes={8}
          game={
            {
              ...getBrowserPoseGameDefinition(code),
              id: code,
              publishedStatus: "published",
            } as unknown as RehabPlan["items"][number]["gameContent"]
          }
          trainingSession={{ id: code } as TrainingSession}
          onResultReady={() => undefined}
        />
      </section>
    ))}
  </>,
);
