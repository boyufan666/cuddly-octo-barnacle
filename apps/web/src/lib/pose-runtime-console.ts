const benignPoseRuntimeConsoleErrorPattern =
  /^INFO:\s+Created TensorFlow Lite XNNPACK delegate for CPU\.$/;

let activeSuppressionCount = 0;
let baseConsoleError: typeof console.error | undefined;
let suppressingConsoleError: typeof console.error | undefined;

export function isBenignPoseRuntimeConsoleError(args: unknown[]) {
  if (args.length !== 1 || typeof args[0] !== "string") {
    return false;
  }

  return benignPoseRuntimeConsoleErrorPattern.test(args[0].trim());
}

export function withBenignPoseConsoleErrorSuppressed<T>(operation: () => T): T {
  installConsoleErrorSuppression();

  try {
    const result = operation();
    if (isPromiseLike(result)) {
      return result.finally(uninstallConsoleErrorSuppression) as T;
    }

    uninstallConsoleErrorSuppression();
    return result;
  } catch (error) {
    uninstallConsoleErrorSuppression();
    throw error;
  }
}

function installConsoleErrorSuppression() {
  if (activeSuppressionCount === 0) {
    baseConsoleError = console.error;
    suppressingConsoleError = (...args: unknown[]) => {
      if (isBenignPoseRuntimeConsoleError(args)) return;
      baseConsoleError?.(...args);
    };
    console.error = suppressingConsoleError;
  }
  activeSuppressionCount += 1;
}

function uninstallConsoleErrorSuppression() {
  activeSuppressionCount = Math.max(0, activeSuppressionCount - 1);
  if (activeSuppressionCount > 0) return;
  if (suppressingConsoleError && console.error === suppressingConsoleError) {
    console.error = baseConsoleError ?? console.error;
  }
  baseConsoleError = undefined;
  suppressingConsoleError = undefined;
}

function isPromiseLike<T>(value: T): value is T & PromiseLike<unknown> & {
  finally: (onFinally: () => void) => unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "finally" in value &&
    typeof value.finally === "function"
  );
}
