import assert from "node:assert/strict";
import test from "node:test";
import {
  conclusionCompatibility,
  isConcernClosed,
  validateConcernSubmission,
} from "../lib/concerns.ts";

test("closed and legacy resolved concerns satisfy the closure gate", () => {
  assert.equal(isConcernClosed("CLOSED"), true);
  assert.equal(isConcernClosed("RESOLVED"), true);
  assert.equal(isConcernClosed("READY_FOR_REVIEW"), false);
  assert.equal(isConcernClosed("REOPENED"), false);
});

test("review submission requires a complete professional assessment", () => {
  const errors = validateConcernSubmission({
    title: "",
    description: "",
    category: "GENERAL",
    severity: "MEDIUM",
    owner: null,
    targetedResponse: "",
    examinerConclusion: "",
    reportingAssessment: "UNDETERMINED",
  });
  assert.equal(errors.length, 6);
  assert.match(errors.join(" "), /title/);
  assert.match(errors.join(" "), /targeted work/);
  assert.match(errors.join(" "), /reporting assessment/);
});

test("a complete concern can be submitted for review", () => {
  assert.deepEqual(
    validateConcernSubmission({
      title: "Restricted fund expenditure",
      description: "Expenditure may not comply with the restriction.",
      category: "ACCOUNTS_COMPLIANCE",
      severity: "HIGH",
      owner: "Examiner",
      targetedResponse: "Inspected the grant agreement and selected invoices.",
      examinerConclusion: "The expenditure was reclassified and the accounts amended.",
      reportingAssessment: "NO_REPORTING_EFFECT",
    }),
    [],
  );
});

test("open concerns block every reporting conclusion", () => {
  const result = conclusionCompatibility("UNMODIFIED", [
    { status: "IN_PROGRESS", reportingAssessment: "NO_REPORTING_EFFECT" },
  ]);
  assert.equal(result.compatible, false);
  assert.match(result.reason, /not closed/);
});

test("an unmodified conclusion requires no closed reporting effects", () => {
  assert.equal(
    conclusionCompatibility("UNMODIFIED", [
      { status: "CLOSED", reportingAssessment: "NO_REPORTING_EFFECT" },
    ]).compatible,
    true,
  );
  assert.equal(
    conclusionCompatibility("UNMODIFIED", [
      { status: "CLOSED", reportingAssessment: "RECORDS_CONCERN" },
    ]).compatible,
    false,
  );
});

test("modified conclusions require matching closed concerns", () => {
  assert.equal(
    conclusionCompatibility("RECORDS_CONCERN", [
      { status: "CLOSED", reportingAssessment: "RECORDS_CONCERN" },
    ]).compatible,
    true,
  );
  assert.equal(
    conclusionCompatibility("ACCOUNTS_CONCERN", [
      { status: "CLOSED", reportingAssessment: "RECORDS_CONCERN" },
    ]).compatible,
    false,
  );
  assert.equal(
    conclusionCompatibility("OTHER_MATTER", [
      { status: "CLOSED", reportingAssessment: "MATERIAL_SIGNIFICANCE" },
    ]).compatible,
    true,
  );
});

