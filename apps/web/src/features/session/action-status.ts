export function extractErrorMessage(error: unknown, defaultMessage: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : defaultMessage;
}

export function updateBusyActions<Action extends string>(
  current: ReadonlySet<Action>,
  action: Action,
  busy: boolean,
) {
  const next = new Set(current);
  if (busy) {
    next.add(action);
  } else {
    next.delete(action);
  }
  return next;
}

export function parseRequiredTrimmedText(value: string, label: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${label}不能为空。`);
  }
  return text;
}

export function patientSafeActionStatus(message: string) {
  if (containsTechnicalActionDetail(message)) {
    return "操作暂时无法完成，请稍后重试或联系医师。";
  }
  return message;
}

export function doctorSafeActionStatus(message: string) {
  if (containsTechnicalActionDetail(message)) {
    return "操作暂时无法完成，请稍后重试或联系管理员。";
  }
  return message;
}

export function createRetainedHighCostResultErrorHandler(
  primaryRole: string | undefined,
  patientLikeShell: boolean,
  setActionStatus: Dispatch<SetStateAction<string | null>>,
  setDataStatus: Dispatch<SetStateAction<string>>,
  setDataError: Dispatch<SetStateAction<string | null>>,
) {
  return (error: unknown, actionMessage: string, defaultMessage: string) => {
    setActionStatus(actionMessage);
    setDataStatus(defaultMessage);
    const message = extractErrorMessage(error, defaultMessage);
    if (primaryRole === "doctor") {
      setDataError(doctorSafeActionStatus(message));
      return;
    }
    if (patientLikeShell) {
      setDataError(patientSafeActionStatus(message));
      return;
    }
    setDataError(message);
  };
}

export function adminActionStatus(message: string) {
  return message;
}

export function patientSafeTrainingActionErrorMessage(
  error: unknown,
  defaultMessage: string,
) {
  const message = extractErrorMessage(error, defaultMessage);
  if (
    /运行批次|游戏版本|数据版本|数据指纹|原始数据|原始载荷|原始请求|原始响应|payload|raw|runtimeType|collectionBatchId|protocolVersion|gameRunId|manifest|bridge|wasm|mediapipe|cdn|stack|failed to fetch|network|authorization|bearer|api[-_ ]?key|accessToken|token|secret|password|credential|cookie/i.test(
      message,
    )
  ) {
    return "训练暂时无法完成，请稍后重试或联系医师。";
  }
  return message;
}

function containsTechnicalActionDetail(message: string) {
  return /运行批次|采集批次|采集协议|协议版本|数据版本|数据指纹|原始数据|原始载荷|原始请求|原始响应|payload|raw|runtimeType|collectionBatchId|protocolId|protocolVersion|gameRunId|manifest|bridge|Provider|Endpoint|endpoint|stack|failed to fetch|network|authorization|bearer|api[-_ ]?key|accessToken|token|secret|password|credential|cookie/i.test(
    message,
  );
}
import type { Dispatch, SetStateAction } from "react";
