export type RuleSeriesItem = {
  id: number;
  version: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

function dayBefore(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function ruleSeriesIssues(rules: RuleSeriesItem[]): string[] {
  const published = rules
    .filter((item) => item.status === "PUBLISHED")
    .sort((a, b) =>
      a.effectiveFrom === b.effectiveFrom
        ? a.version.localeCompare(b.version)
        : a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
  const issues: string[] = [];
  for (let index = 0; index < published.length; index += 1) {
    const current = published[index];
    const next = published[index + 1];
    if (current.effectiveTo && current.effectiveTo < current.effectiveFrom)
      issues.push(`${current.version} ends before it starts`);
    if (!next) continue;
    if (!current.effectiveTo || current.effectiveTo >= next.effectiveFrom)
      issues.push(`${current.version} overlaps ${next.version}`);
    else if (current.effectiveTo !== dayBefore(next.effectiveFrom))
      issues.push(`${current.version} and ${next.version} leave a coverage gap`);
  }
  return issues;
}

export function planRulePublication(
  draft: RuleSeriesItem,
  allRules: RuleSeriesItem[],
): { predecessorId: number | null; predecessorEffectiveTo: string | null } {
  if (draft.status !== "DRAFT") throw new Error("Only draft rules can be published");
  const duplicate = allRules.find(
    (item) => item.id !== draft.id && item.version.toLowerCase() === draft.version.toLowerCase(),
  );
  if (duplicate) throw new Error("Rule version must be unique within the jurisdiction");
  const published = allRules.filter((item) => item.status === "PUBLISHED");
  const predecessor = published
    .filter((item) => item.effectiveFrom < draft.effectiveFrom)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const successor = published
    .filter((item) => item.effectiveFrom >= draft.effectiveFrom)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  if (successor)
    throw new Error(
      `The effective date conflicts with published version ${successor.version}`,
    );
  if (
    predecessor?.effectiveTo &&
    predecessor.effectiveTo < dayBefore(draft.effectiveFrom)
  )
    throw new Error(
      `The new version leaves a coverage gap after ${predecessor.version}`,
    );
  return {
    predecessorId: predecessor?.id ?? null,
    predecessorEffectiveTo: predecessor ? dayBefore(draft.effectiveFrom) : null,
  };
}

