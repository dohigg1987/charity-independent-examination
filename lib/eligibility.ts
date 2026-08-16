export type Eligibility = { eligible:boolean; scrutiny:"NONE"|"INDEPENDENT_EXAMINATION"|"AUDIT"; qualifiedExaminerRequired:boolean; framework:string; reason:string; thresholds:{examinationFloor:number;qualificationFloor:number;auditIncome:number;assetIncomeFloor:number;auditAssets:number} };
export type EligibilityOverrides={ governingDocumentAudit?:boolean; funderAudit?:boolean; commissionAudit?:boolean; groupAccountsRequired?:boolean; legalForm?:string };
export type ConfiguredRule={version:string;effectiveFrom:string;effectiveTo?:string|null;effectiveDateBasis?:"PERIOD_START"|"PERIOD_END";periodStart?:string|null;examinationFloor:number;qualificationFloor:number;qualificationFloorInclusive?:boolean;auditIncome:number;auditIncomeInclusive?:boolean;assetIncomeFloor:number;auditAssets:number;allCharitiesScrutinised?:boolean;assetTestBasis?:"INCOME_AND_ASSETS"|"ACCRUALS_ASSETS"|"NONE";jurisdictionName?:string;accountingBasis?:string};

export function assessConfiguredEligibility(periodEnd:string,grossIncome:number,grossAssets:number,rule:ConfiguredRule,overrides:EligibilityOverrides={}):Eligibility {
  const thresholds={examinationFloor:rule.examinationFloor,qualificationFloor:rule.qualificationFloor,auditIncome:rule.auditIncome,assetIncomeFloor:rule.assetIncomeFloor,auditAssets:rule.auditAssets};
  const applicableDate=rule.effectiveDateBasis==="PERIOD_START"?(rule.periodStart??periodEnd):periodEnd;
  const framework=`${rule.jurisdictionName??"Jurisdiction"} rules ${rule.version}, effective for ${rule.effectiveDateBasis==="PERIOD_START"?"periods starting":"periods ending"} ${rule.effectiveFrom}${rule.effectiveTo?` to ${rule.effectiveTo}`:" onwards"}`;
  if(applicableDate<rule.effectiveFrom||(rule.effectiveTo&&applicableDate>rule.effectiveTo))return {eligible:false,scrutiny:"AUDIT",qualifiedExaminerRequired:true,framework,thresholds,reason:"The pinned rules are not effective for this accounting period. Reassess the jurisdiction in engagement acceptance."};
  if(overrides.governingDocumentAudit||overrides.funderAudit||overrides.commissionAudit||overrides.groupAccountsRequired)return {eligible:false,scrutiny:"AUDIT",qualifiedExaminerRequired:true,framework,thresholds,reason:"Audit required by the governing document, funder, group position or regulator direction"};
  const assetTest=rule.assetTestBasis==="ACCRUALS_ASSETS"?rule.accountingBasis==="Accruals"&&grossAssets>rule.auditAssets:rule.assetTestBasis==="INCOME_AND_ASSETS"?grossIncome>rule.assetIncomeFloor&&grossAssets>rule.auditAssets:false;
  const incomeAudit=rule.auditIncomeInclusive?grossIncome>=rule.auditIncome:grossIncome>rule.auditIncome;
  if(incomeAudit||assetTest)return {eligible:false,scrutiny:"AUDIT",qualifiedExaminerRequired:true,framework,thresholds,reason:"Statutory audit threshold met"};
  if(!rule.allCharitiesScrutinised&&grossIncome<=rule.examinationFloor)return {eligible:true,scrutiny:"NONE",qualifiedExaminerRequired:false,framework,thresholds,reason:"No statutory external scrutiny based on income; check the governing document and any other requirement"};
  const qualified=rule.qualificationFloorInclusive?grossIncome>=rule.qualificationFloor:grossIncome>rule.qualificationFloor;
  return {eligible:true,scrutiny:"INDEPENDENT_EXAMINATION",qualifiedExaminerRequired:qualified,framework,thresholds,reason:qualified?"Independent examination permitted; a qualified independent examiner is required":"Independent examination permitted, subject to the governing document and other requirements"};
}

export function assessEligibility(periodEnd:string,grossIncome:number,grossAssets:number,overrides:EligibilityOverrides={}):Eligibility {
  const revised=periodEnd>="2026-09-30";
  const examinationFloor=revised?40_000:25_000;
  const qualificationFloor=revised?500_000:250_000;
  const auditIncome=revised?1_500_000:1_000_000;
  const auditAssets=revised?5_000_000:3_260_000;
  const assetIncomeFloor=revised?500_000:250_000;
  const framework=revised?"Thresholds for accounting periods ending on or after 30 September 2026":"Thresholds for accounting periods ending before 30 September 2026";
  const thresholds={examinationFloor,qualificationFloor,auditIncome,assetIncomeFloor,auditAssets};
  if(overrides.governingDocumentAudit||overrides.funderAudit||overrides.commissionAudit||overrides.groupAccountsRequired)return {eligible:false,scrutiny:"AUDIT",qualifiedExaminerRequired:true,framework,thresholds,reason:"Audit required by the governing document, funder, group position or Charity Commission direction"};
  if(grossIncome>auditIncome||(grossIncome>assetIncomeFloor&&grossAssets>auditAssets))return {eligible:false,scrutiny:"AUDIT",qualifiedExaminerRequired:true,framework,thresholds,reason:"Statutory audit threshold met"};
  if(grossIncome<=examinationFloor)return {eligible:true,scrutiny:"NONE",qualifiedExaminerRequired:false,framework,thresholds,reason:"No statutory external scrutiny based on income; check the governing document and any other requirement"};
  return {eligible:true,scrutiny:"INDEPENDENT_EXAMINATION",qualifiedExaminerRequired:grossIncome>qualificationFloor,framework,thresholds,reason:grossIncome>qualificationFloor?"Independent examination permitted; a qualified independent examiner is required":"Independent examination permitted, subject to the governing document and other requirements"};
}
