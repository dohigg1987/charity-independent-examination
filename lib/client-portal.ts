export function portalCompletion(totalTasks: number, reviewedTasks: number) {
  if (!Number.isFinite(totalTasks) || totalTasks <= 0) return 0;
  const reviewed = Number.isFinite(reviewedTasks) ? reviewedTasks : 0;
  return Math.min(100, Math.max(0, Math.round((reviewed / totalTasks) * 100)));
}

export function isRequestOverdue(
  dueDate: string,
  status: string,
  today = new Date().toISOString().slice(0, 10),
) {
  return status === "OVERDUE" || (status !== "RECEIVED" && dueDate < today);
}

export function choosePortalEngagement<T extends string | number>(
  engagementIds: T[],
  preferredId: T | null | undefined,
  requestedId: T | null | undefined,
): T | null {
  if (preferredId && engagementIds.includes(preferredId)) return preferredId;
  if (requestedId && engagementIds.includes(requestedId)) return requestedId;
  return engagementIds[0] ?? null;
}
