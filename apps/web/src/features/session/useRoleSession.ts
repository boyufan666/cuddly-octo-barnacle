import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError, api } from "@/lib/api";
import type { AuthenticatedSession } from "@/types/api";
import {
  resolveAccessiblePatientIds,
  resolveActivePatientId,
} from "@/features/session/useRoleData";

export const selectedPatientIdKey = "rehab-platform-selected-patient-id";

type RoleSessionState = {
  apiStatus: string;
  dataError: string | null;
  dataStatus: string;
  selectedPatientId: string | null;
  session: AuthenticatedSession | null;
  passwordResetRequired: boolean;
};

type UseRoleSessionOptions = {
  onAuthenticated: (
    session: AuthenticatedSession,
    patientId?: string,
    context?: { signal?: AbortSignal },
  ) => Promise<void>;
  onClearAuthenticatedState: (status: string, message?: string) => void;
  onHomeResolved: (session: AuthenticatedSession, patientId?: string) => void;
};

export function useRoleSession({
  onAuthenticated,
  onClearAuthenticatedState,
  onHomeResolved,
}: UseRoleSessionOptions) {
  const isClientReady = useClientReady();
  const [apiStatus, setApiStatus] = useState("服务检测中");
  const [session, setSession] = useState<AuthenticatedSession | null>(null);
  const sessionRef = useRef<AuthenticatedSession | null>(null);
  const [dataStatus, setDataStatus] = useState("未登录");
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [restoreLifecycle] = useState(createCookieSessionRestoreLifecycle);
  const callbacksRef = useRef({
    onAuthenticated,
    onClearAuthenticatedState,
    onHomeResolved,
  });

  const applySession = useCallback(
    (nextSession: AuthenticatedSession | null) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
    },
    [],
  );

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    callbacksRef.current = {
      onAuthenticated,
      onClearAuthenticatedState,
      onHomeResolved,
    };
  }, [onAuthenticated, onClearAuthenticatedState, onHomeResolved]);

  useEffect(() => {
    restoreLifecycle.mount();
    return () => restoreLifecycle.unmount();
  }, [restoreLifecycle]);

  useEffect(() => {
    api
      .health()
      .then(() => setApiStatus("服务可用"))
      .catch(() => setApiStatus("服务暂不可用"));
  }, []);

  const clearSessionState = useCallback(
    (status: string, message?: string) => {
      restoreLifecycle.cancel();
      window.localStorage.removeItem(selectedPatientIdKey);
      applySession(null);
      setSelectedPatientId(null);
      setDataStatus(status);
      setDataError(message ?? null);
      callbacksRef.current.onClearAuthenticatedState(status, message);
    },
    [applySession, restoreLifecycle],
  );

  const updateSelectedPatientId = useCallback((patientId: string | null) => {
    if (patientId) {
      window.localStorage.setItem(selectedPatientIdKey, patientId);
    } else {
      window.localStorage.removeItem(selectedPatientIdKey);
    }
    setSelectedPatientId(patientId);
  }, []);

  const restoreCookieSession = useCallback(async () => {
    if (sessionRef.current) return;
    const operation = restoreLifecycle.begin();
    if (!operation) return;

    setDataStatus("恢复登录状态");
    try {
      const meResponse = await api.me({ signal: operation.signal });
      if (
        !shouldApplyCookieSessionRestore({
          restoreSequence: operation.sequence,
          currentRestoreSequence: restoreLifecycle.currentSequence(),
          hasActiveSession: Boolean(sessionRef.current),
          isMounted: restoreLifecycle.isMounted(),
          isAborted: operation.signal.aborted,
        })
      ) {
        return;
      }
      const restoredSession: AuthenticatedSession = {
        status: "authenticated",
        requestEpoch: crypto.randomUUID(),
        user: meResponse.user,
        context: meResponse.context,
      };
      const patientId = resolveStoredActivePatientId(
        restoredSession,
        window.localStorage.getItem(selectedPatientIdKey),
      );
      applySession(restoredSession);
      updateSelectedPatientId(patientId ?? null);
      callbacksRef.current.onHomeResolved(restoredSession, patientId);
      await callbacksRef.current.onAuthenticated(restoredSession, patientId, {
        signal: operation.signal,
      });
    } catch (error) {
      if (
        !shouldApplyCookieSessionRestore({
          restoreSequence: operation.sequence,
          currentRestoreSequence: restoreLifecycle.currentSequence(),
          hasActiveSession: Boolean(sessionRef.current),
          isMounted: restoreLifecycle.isMounted(),
          isAborted: operation.signal.aborted,
        })
      ) {
        return;
      }
      clearSessionState(
        error instanceof ApiError && error.status === 401
          ? "未登录"
          : "会话恢复失败",
        error instanceof ApiError && error.status === 401
          ? undefined
          : error instanceof Error
            ? error.message
            : "会话恢复失败，请重试",
      );
    } finally {
      restoreLifecycle.complete(operation);
    }
  }, [
    applySession,
    clearSessionState,
    restoreLifecycle,
    updateSelectedPatientId,
  ]);

  useEffect(() => {
    if (!isClientReady) return;
    const timer = window.setTimeout(() => {
      void restoreCookieSession();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isClientReady, restoreCookieSession]);

  async function handleLogin(account: string, password: string) {
    restoreLifecycle.cancel();
    setDataStatus("登录中");
    setDataError(null);

    try {
      const loginResponse = await api.login(account, password);
      if (loginResponse.status === "password_reset_required") {
        setPasswordResetRequired(true);
        setDataStatus("必须重设密码");
        setDataError("管理员已要求更新密码。请设置新密码后重新登录。");
        return;
      }
      const authenticatedSession: AuthenticatedSession = {
        ...loginResponse,
        requestEpoch: crypto.randomUUID(),
      };
      const patientId = resolveStoredActivePatientId(
        authenticatedSession,
        window.localStorage.getItem(selectedPatientIdKey),
      );
      setPasswordResetRequired(false);
      applySession(authenticatedSession);
      updateSelectedPatientId(patientId ?? null);
      onHomeResolved(authenticatedSession, patientId);
      await onAuthenticated(authenticatedSession, patientId);
    } catch (error) {
      applySession(null);
      setDataStatus("登录失败");
      setDataError(error instanceof Error ? error.message : "登录失败");
      throw error;
    }
  }

  async function handlePasswordReset(newPassword: string) {
    setDataStatus("正在更新密码");
    setDataError(null);
    try {
      await api.completePasswordReset(newPassword);
      setPasswordResetRequired(false);
      clearSessionState("密码已更新", "请使用新密码重新登录。");
    } catch (error) {
      const failure = resolvePasswordResetFailure(error);
      setPasswordResetRequired(failure.passwordResetRequired);
      if (failure.passwordResetRequired) {
        setDataStatus(failure.status);
        setDataError(failure.message);
      } else {
        clearSessionState(failure.status, failure.message);
      }
      throw error;
    }
  }

  async function handleLogout() {
    restoreLifecycle.cancel();
    try {
      await api.logout();
      clearSessionState("已退出登录");
    } catch (error) {
      setDataStatus("退出失败");
      setDataError(
        error instanceof Error ? error.message : "退出失败，请重试。",
      );
    }
  }

  function handleUnauthorized(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      clearSessionState("登录已过期", "登录已过期，请重新登录。");
      return true;
    }
    return false;
  }

  return {
    apiStatus,
    dataError,
    dataStatus,
    handleLogin,
    handleLogout,
    handlePasswordReset,
    handleUnauthorized,
    selectedPatientId,
    passwordResetRequired,
    session,
    setDataError,
    setDataStatus,
    setSelectedPatientId: updateSelectedPatientId,
    setSession: applySession,
  } satisfies RoleSessionState & {
    handleLogin: typeof handleLogin;
    handleLogout: typeof handleLogout;
    handlePasswordReset: typeof handlePasswordReset;
    handleUnauthorized: typeof handleUnauthorized;
    setDataError: typeof setDataError;
    setDataStatus: typeof setDataStatus;
    setSelectedPatientId: typeof updateSelectedPatientId;
    setSession: typeof applySession;
  };
}

export function shouldApplyCookieSessionRestore({
  restoreSequence,
  currentRestoreSequence,
  hasActiveSession,
  isMounted,
  isAborted,
}: {
  restoreSequence: number;
  currentRestoreSequence: number;
  hasActiveSession: boolean;
  isMounted: boolean;
  isAborted: boolean;
}) {
  return (
    restoreSequence === currentRestoreSequence &&
    !hasActiveSession &&
    isMounted &&
    !isAborted
  );
}

type CookieSessionRestoreOperation = {
  sequence: number;
  signal: AbortSignal;
};

export function createCookieSessionRestoreLifecycle() {
  let currentSequence = 0;
  let mounted = false;
  let active:
    | (CookieSessionRestoreOperation & { controller: AbortController })
    | null = null;

  function cancel() {
    currentSequence += 1;
    active?.controller.abort();
    active = null;
  }

  return {
    begin(): CookieSessionRestoreOperation | null {
      if (!mounted || (active && !active.signal.aborted)) return null;
      const controller = new AbortController();
      currentSequence += 1;
      active = {
        controller,
        sequence: currentSequence,
        signal: controller.signal,
      };
      return {
        sequence: active.sequence,
        signal: active.signal,
      };
    },
    cancel,
    complete(operation: CookieSessionRestoreOperation) {
      if (active?.sequence === operation.sequence) {
        active = null;
      }
    },
    currentSequence() {
      return currentSequence;
    },
    isMounted() {
      return mounted;
    },
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      cancel();
    },
  };
}

export function shouldApplyAuthenticatedSideEffect({
  operationToken,
  activeSessionToken,
}: {
  operationToken: string;
  activeSessionToken: string | null;
}) {
  return Boolean(activeSessionToken) && operationToken === activeSessionToken;
}

export function resolveStoredActivePatientId(
  session: AuthenticatedSession,
  storedPatientId?: string | null,
) {
  const accessiblePatientIds = resolveAccessiblePatientIds(session);
  if (storedPatientId && accessiblePatientIds.includes(storedPatientId)) {
    return storedPatientId;
  }
  return session.context.primaryRole === "patient"
    ? resolveActivePatientId(session)
    : undefined;
}

export function isPatientSelectionAuthorized(
  session: AuthenticatedSession,
  patientId: string,
) {
  return resolveAccessiblePatientIds(session).includes(patientId);
}

export function resolvePasswordResetFailure(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return {
      passwordResetRequired: false,
      status: "密码重置会话已过期",
      message: "密码重置会话已过期，请使用临时密码重新登录。",
    } as const;
  }
  return {
    passwordResetRequired: true,
    status: "密码更新失败",
    message: error instanceof Error ? error.message : "密码更新失败",
  } as const;
}

function useClientReady() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
