import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { openBrowserPoseCamera } from "@/lib/browser-pose-camera-access";
import type { AuthenticatedSession } from "@/types/api";
import { useRoleData } from "./useRoleData";

declare global {
  interface Window {
    roleLifecycleHarness: {
      loadPatient: (patientId: string, signal?: AbortSignal) => Promise<void>;
      logout: () => void;
      probeCameraConsent: () => Promise<string>;
      snapshot: () => {
        error: string | null;
        patientId?: string;
        status: string;
      };
      unmount: () => void;
    };
    roleLifecyclePromises: Record<string, Promise<void>>;
  }
}

const session: AuthenticatedSession = {
  status: "authenticated",
  requestEpoch: "mounted-session",
  user: {
    id: "user-mounted",
    account: "mounted",
    displayName: "Mounted Harness",
    roles: [
      {
        roleCode: "patient",
        relatedObjectType: "patient",
        relatedObjectId: "patient-b",
      },
    ],
  },
  context: {
    primaryRole: "patient",
    patientIds: ["patient-b", "patient-c"],
    caregiverPatientIds: [],
    doctorPatientIds: [],
    doctorIds: [],
    organizationIds: [],
    caregiverScopes: {},
    adminPermissions: [],
  },
};

const root = createRoot(document.getElementById("root") as HTMLElement);

function RoleDataLifecycleHarness() {
  const mountedRef = useRef(false);
  const activeSessionTokenRef = useRef<string | null>(session.requestEpoch);
  const activePatientIdRef = useRef<string | null>(null);
  const { clearRoleData, data, dataError, dataStatus, loadRoleData } =
    useRoleData({
      isRequestCurrent: (requestEpoch) =>
        mountedRef.current && requestEpoch === activeSessionTokenRef.current,
    });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeSessionTokenRef.current = null;
      activePatientIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.roleLifecycleHarness = {
      async loadPatient(patientId, signal) {
        activePatientIdRef.current = patientId;
        await loadRoleData(session, patientId, undefined, { signal });
      },
      logout() {
        activeSessionTokenRef.current = null;
        activePatientIdRef.current = null;
        clearRoleData("已退出登录");
      },
      async probeCameraConsent() {
        try {
          await openBrowserPoseCamera();
          return "camera-consent-active";
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
      snapshot: () => ({
        error: dataError,
        patientId: data.patient?.id,
        status: dataStatus,
      }),
      unmount: () => root.unmount(),
    };
  }, [clearRoleData, data.patient?.id, dataError, dataStatus, loadRoleData]);

  return (
    <output data-testid="role-data-lifecycle-state">
      {data.patient?.id ?? "no-patient"}:{dataStatus}
    </output>
  );
}

window.roleLifecyclePromises = {};
root.render(<RoleDataLifecycleHarness />);
