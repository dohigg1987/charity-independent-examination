export const concernStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "CLOSED",
  "REOPENED",
  "RESOLVED",
] as const;

export const concernCategories = [
  "GENERAL",
  "ACCOUNTING_RECORDS",
  "ACCOUNTS_COMPLIANCE",
  "OTHER_MATTER",
  "MATERIAL_SIGNIFICANCE",
] as const;

export const reportingAssessments = [
  "UNDETERMINED",
  "NO_REPORTING_EFFECT",
  "RECORDS_CONCERN",
  "ACCOUNTS_CONCERN",
  "OTHER_MATTER",
  "MATERIAL_SIGNIFICANCE",
] as const;

export type ConcernStatus = (typeof concernStatuses)[number];
export type ConcernCategory = (typeof concernCategories)[number];
export type ReportingAssessment = (typeof reportingAssessments)[number];

export type ConcernForReporting = {
  status: string;
  reportingAssessment: string;
};

export const closedConcernStatuses = new Set(["CLOSED", "RESOLVED"]);

export function isConcernClosed(status: string): boolean {
  return closedConcernStatuses.has(status);
}

export function validateConcernSubmission(input: {
  title: string;
  description: string;
  category: string;
  severity: string;
  owner: string | null;
  targetedResponse: string;
  examinerConclusion: string;
  reportingAssessment: string;
}): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push("A concern title is required");
  if (!input.description.trim()) errors.push("A concern description is required");
  if (!concernCategories.includes(input.category as ConcernCategory))
    errors.push("Select a valid concern category");
  if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(input.severity))
    errors.push("Select a valid concern severity");
  if (!input.owner?.trim()) errors.push("Assign an owner before review");
  if (!input.targetedResponse.trim())
    errors.push("Record the targeted work performed");
  if (!input.examinerConclusion.trim())
    errors.push("Record the examiner's conclusion");
  if (
    input.reportingAssessment === "UNDETERMINED" ||
    !reportingAssessments.includes(
      input.reportingAssessment as ReportingAssessment,
    )
  )
    errors.push("Complete the reporting assessment");
  return errors;
}

export function conclusionCompatibility(
  conclusion: string | null | undefined,
  concerns: ConcernForReporting[],
): { compatible: boolean; reason: string } {
  const open = concerns.filter((item) => !isConcernClosed(item.status));
  if (open.length)
    return {
      compatible: false,
      reason: `${open.length} concern${open.length === 1 ? " is" : "s are"} not closed`,
    };
  const assessments = new Set(
    concerns
      .filter((item) => isConcernClosed(item.status))
      .map((item) => item.reportingAssessment),
  );
  if (!conclusion)
    return { compatible: false, reason: "Select a reporting conclusion" };
  if (conclusion === "UNMODIFIED") {
    const reportEffects = [...assessments].filter(
      (value) =>
        value !== "NO_REPORTING_EFFECT" && value !== "UNDETERMINED",
    );
    return reportEffects.length
      ? {
          compatible: false,
          reason: "A closed concern has a reporting effect",
        }
      : { compatible: true, reason: "No closed concern has a reporting effect" };
  }
  const expected: Record<string, string[]> = {
    RECORDS_CONCERN: ["RECORDS_CONCERN"],
    ACCOUNTS_CONCERN: ["ACCOUNTS_CONCERN"],
    OTHER_MATTER: ["OTHER_MATTER", "MATERIAL_SIGNIFICANCE"],
  };
  const required = expected[conclusion];
  if (!required)
    return { compatible: false, reason: "Select a valid reporting conclusion" };
  return required.some((assessment) => assessments.has(assessment))
    ? { compatible: true, reason: "The conclusion matches a closed concern" }
    : {
        compatible: false,
        reason: "No closed concern supports the selected reporting conclusion",
      };
}
