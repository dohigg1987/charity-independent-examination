export type CharityProfile = {
  grossIncome: number;
  grossAssets: number;
  groupIncome?: number;
  isCompany: boolean;
  wantsReceiptsAndPayments: boolean;
  governingDocumentRequiresAudit: boolean;
  funderRequiresAudit: boolean;
};

export type EligibilityResult = {
  eligibleForIndependentExamination: boolean;
  eligibleForReceiptsAndPayments: boolean;
  qualifiedExaminerRequired: boolean;
  reasons: string[];
};

export function assessEligibility(profile: CharityProfile): EligibilityResult {
  const reasons: string[] = [];
  const statutoryAudit = profile.grossIncome > 1_000_000 ||
    (profile.grossIncome > 250_000 && profile.grossAssets > 3_260_000) ||
    (profile.groupIncome !== undefined && profile.groupIncome > 1_000_000);
  if (statutoryAudit) reasons.push("The statutory audit threshold is exceeded.");
  if (profile.governingDocumentRequiresAudit) reasons.push("The governing document requires an audit.");
  if (profile.funderRequiresAudit) reasons.push("A funding condition requires an audit.");

  const eligibleForIndependentExamination = !statutoryAudit &&
    !profile.governingDocumentRequiresAudit && !profile.funderRequiresAudit;
  const eligibleForReceiptsAndPayments = !profile.isCompany &&
    profile.grossIncome <= 250_000 && !profile.governingDocumentRequiresAudit && !profile.funderRequiresAudit;
  if (profile.wantsReceiptsAndPayments && !eligibleForReceiptsAndPayments) {
    reasons.push("Receipts and payments accounts are not available for this profile.");
  }

  return {
    eligibleForIndependentExamination,
    eligibleForReceiptsAndPayments,
    qualifiedExaminerRequired: profile.grossIncome > 250_000,
    reasons
  };
}
