import { prisma } from "./client";

/** Ids of the guide steps this person has already seen. */
export async function seenGuides(userId: string) {
  const rows = await prisma.userGuide.findMany({ where: { userId }, select: { stepId: true } });
  return rows.map((r) => r.stepId);
}

export async function markGuidesSeen(userId: string, stepIds: string[]) {
  const ids = [...new Set(stepIds.filter((s) => /^[a-zA-Z0-9._-]{1,64}$/.test(s)))].slice(0, 200);
  if (ids.length === 0) return;
  await prisma.userGuide.createMany({ data: ids.map((stepId) => ({ userId, stepId })), skipDuplicates: true });
}

/** For "take the tour again": forget what was seen. */
export async function resetGuides(userId: string) {
  await prisma.userGuide.deleteMany({ where: { userId } });
}
