import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

test("caregiver patient selector renders every authorized patient and current selection", async () => {
  const selectorModule = await import("./CaregiverPatientSelector");
  const CaregiverPatientSelector = (
    selectorModule as typeof selectorModule & {
      CaregiverPatientSelector: (props: {
        onSelectPatient: (patientId: string) => void;
        options: Array<{ id: string; name: string }>;
        selectedPatientId: string | null;
      }) => React.ReactNode;
    }
  ).CaregiverPatientSelector;

  assert.equal(typeof CaregiverPatientSelector, "function");
  const html = renderToStaticMarkup(
    <CaregiverPatientSelector
      onSelectPatient={() => undefined}
      options={[
        { id: "patient-b", name: "患者 B" },
        { id: "patient-c", name: "患者 C" },
      ]}
      selectedPatientId="patient-c"
    />,
  );

  assert.match(html, /aria-label="选择授权患者"/);
  assert.match(html, /value="patient-b"[^>]*>患者 B/);
  assert.match(html, /value="patient-c" selected="">患者 C/);
});

test("caregiver patient selector keeps an explicit unselected option", async () => {
  const { CaregiverPatientSelector } = await import("./CaregiverPatientSelector");
  const html = renderToStaticMarkup(
    <CaregiverPatientSelector
      onSelectPatient={() => undefined}
      options={[
        { id: "patient-b", name: "患者 B" },
        { id: "patient-c", name: "患者 C" },
      ]}
      selectedPatientId={null}
    />,
  );

  assert.match(
    html,
    /<option disabled="" value="" selected="">请选择授权患者<\/option>/,
  );
  assert.doesNotMatch(html, /value="patient-b" selected/);
});
