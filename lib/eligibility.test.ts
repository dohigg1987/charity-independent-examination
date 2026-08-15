import { describe, expect, it } from "vitest";
import { assessEligibility } from "./eligibility";

describe("CC32 eligibility gate", () => {
  it("permits an examination below the audit thresholds", () => {
    const result = assessEligibility({ grossIncome: 600_000, grossAssets: 2_000_000, isCompany: false, wantsReceiptsAndPayments: false, governingDocumentRequiresAudit: false, funderRequiresAudit: false });
    expect(result.eligibleForIndependentExamination).toBe(true);
    expect(result.qualifiedExaminerRequired).toBe(true);
  });

  it("requires audit where income exceeds £1m", () => {
    const result = assessEligibility({ grossIncome: 1_000_001, grossAssets: 100_000, isCompany: false, wantsReceiptsAndPayments: false, governingDocumentRequiresAudit: false, funderRequiresAudit: false });
    expect(result.eligibleForIndependentExamination).toBe(false);
  });

  it("blocks receipts and payments accounts for a company", () => {
    const result = assessEligibility({ grossIncome: 100_000, grossAssets: 100_000, isCompany: true, wantsReceiptsAndPayments: true, governingDocumentRequiresAudit: false, funderRequiresAudit: false });
    expect(result.eligibleForReceiptsAndPayments).toBe(false);
  });
});
