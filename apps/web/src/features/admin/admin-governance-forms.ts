import type {
  ExportDataset,
  GameContent,
  UpdateUnityBuildRequest,
} from "@/types/api";

export type CaregiverAccountFormState = {
  account: string;
  displayName: string;
  initialPassword: string;
  mobilePhone: string;
};

export type DataExportFormState = {
  dataset: ExportDataset;
  dateFrom: string;
  dateTo: string;
  format: "csv";
  limit: string;
  patientId: string;
  reason: string;
};

export type GameContentCreateFormState = {
  code: string;
  defaultDifficulty: string;
  defaultDuration: string;
  gameVersion: string;
  name: string;
  requiredMetricsText: string;
  runtimeType: GameContent["runtimeType"];
  supportedInputModesText: string;
  supportsCamera: "" | "true" | "false";
  supportsMicrophone: "" | "true" | "false";
  tagsText: string;
  trainingTargetsText: string;
};

export type UnityBuildFormState = {
  bridgeProtocolVersion: "1.0.0";
  buildBaseUrl: string;
  buildStatus: UpdateUnityBuildRequest["buildStatus"];
  gameContentId: string;
  gameVersion: string;
  manifestUrl: string;
  releaseChannel: UpdateUnityBuildRequest["releaseChannel"];
  requiredMetricsText: string;
  supportedInputModesText: string;
  supportsCamera: boolean;
  supportsMicrophone: boolean;
};
