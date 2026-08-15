export type Direction = {
  id: number;
  title: string;
  objective: string;
  phase: "Acceptance" | "Planning" | "Fieldwork" | "Completion";
  applies: "All" | "Accruals" | "All (part for R&P)";
  procedures: string[];
};

export const directions: Direction[] = [
  { id: 1, phase: "Acceptance", applies: "All", title: "Eligibility for independent examination", objective: "Confirm that neither charity law, company law, the governing document nor another obligation requires an audit.", procedures: ["Recalculate gross income and aggregate assets", "Consider subsidiaries, branches and group thresholds", "Inspect the governing document and funding conditions", "Confirm the accounting basis is permitted"] },
  { id: 2, phase: "Acceptance", applies: "All", title: "Independence and competence", objective: "Document the examiner’s independence, objectivity, experience and any required professional qualification.", procedures: ["Complete relationship and financial-interest declaration", "Assess perceived as well as actual threats", "Confirm competence and professional body eligibility", "Record safeguards or decline the appointment"] },
  { id: 3, phase: "Planning", applies: "All", title: "Record the examination", objective: "Create a sufficient record of the approach, evidence, conclusions and significant judgements for every applicable Direction.", procedures: ["Establish indexed workpapers", "Cross-reference evidence and conclusions", "Record preparer and reviewer sign-offs", "Retain a complete audit trail"] },
  { id: 4, phase: "Planning", applies: "All", title: "Plan the examination", objective: "Understand the charity and tailor proportionate procedures to its activities, systems, funds and risks.", procedures: ["Read prior accounts and governing document", "Understand activities, funds and accounting systems", "Determine materiality and significant areas", "Document timetable and information requirements"] },
  { id: 5, phase: "Fieldwork", applies: "All", title: "Accounting records", objective: "Check that accounting records are kept to the standard required by law.", procedures: ["Inspect cashbook, ledgers and supporting records", "Check completeness and clarity of entries", "Review bank reconciliations", "Investigate gaps or unexplained adjustments"] },
  { id: 6, phase: "Fieldwork", applies: "All", title: "Accounts agree to records", objective: "Confirm that the accounts are consistent with the underlying accounting records.", procedures: ["Agree primary statements to trial balance or cashbook", "Reconcile fund movements", "Trace material balances", "Document and clear differences"] },
  { id: 7, phase: "Fieldwork", applies: "Accruals", title: "Related-party disclosures", objective: "For accruals accounts, determine whether related-party transactions are properly disclosed.", procedures: ["Obtain trustee and related-party declarations", "Search ledgers and minutes for transactions", "Assess completeness of names, relationships and amounts", "Agree disclosures to evidence"] },
  { id: 8, phase: "Fieldwork", applies: "All (part for R&P)", title: "Policies, estimates and fund accounting", objective: "Assess significant estimates, judgements, policies and the accounting treatment of restricted, endowment and unrestricted funds.", procedures: ["Review significant estimates and judgements", "Check consistency and suitability of policies", "Test fund classification and transfers", "Challenge unusual treatments"] },
  { id: 9, phase: "Fieldwork", applies: "All (part for R&P)", title: "Financial circumstances and going concern", objective: "Check trustees’ consideration of the charity’s financial circumstances and, for accruals accounts, their going-concern assessment.", procedures: ["Review budgets, forecasts and post-year-end information", "Inspect trustees’ assessment and approval", "Consider liquidity and funding dependencies", "Evaluate the adequacy of disclosures"] },
  { id: 10, phase: "Fieldwork", applies: "All", title: "Form and content of accounts", objective: "Check compliance with the applicable statutory form and content requirements.", procedures: ["Identify legal form and accounting framework", "Complete disclosure checklist", "Check statement titles, comparative information and notes", "Record departures and required amendments"] },
  { id: 11, phase: "Fieldwork", applies: "All", title: "Analytical review and follow-up", objective: "Identify unexpected relationships, movements and items, then obtain explanations and evidence.", procedures: ["Compare current and prior periods", "Calculate relevant ratios and expectations", "Investigate significant or unusual variances", "Corroborate management explanations"] },
  { id: 12, phase: "Completion", applies: "All", title: "Trustees’ annual report", objective: "Compare the trustees’ annual report with the accounts and address material inconsistencies.", procedures: ["Read the complete trustees’ annual report", "Cross-check financial and narrative information", "Review public benefit and reserves disclosures", "Resolve material inconsistencies"] },
  { id: 13, phase: "Completion", applies: "All", title: "Examiner’s report", objective: "Prepare, date and sign a report containing all legally required statements and any necessary disclosures.", procedures: ["Evaluate all findings and uncorrected matters", "Complete material-significance assessment", "Select and review the appropriate report wording", "Confirm trustee approval precedes report signature"] }
];

export type Status = "Not started" | "In progress" | "Prepared" | "Reviewed";

export const initialStatuses: Record<number, Status> = {
  1: "Reviewed", 2: "Reviewed", 3: "Prepared", 4: "Reviewed", 5: "Prepared", 6: "In progress",
  7: "In progress", 8: "In progress", 9: "Not started", 10: "In progress", 11: "Prepared", 12: "Not started", 13: "Not started"
};
