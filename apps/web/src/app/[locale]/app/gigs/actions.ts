"use server";

import { getTranslations } from "next-intl/server";
import { changeBookingStatus, liveAssignmentOf, prisma, respondToAssignment } from "@stagedesk/db";
import { type ActionResult, runAction } from "@/lib/actions";
import { requirePermission } from "@/lib/viewer";

/** The signed-in artist accepts or declines a request made to one of their profiles. */
export async function respondGigAction(assignmentId: string, accept: boolean, reason: string): Promise<ActionResult> {
  const viewer = await requirePermission("artist.gigs");
  const t = await getTranslations("gigs");
  return runAction(
    () =>
      respondToAssignment(
        assignmentId,
        viewer.user.id,
        accept ? { accept: true } : { accept: false, reason: reason.trim().slice(0, 1000) || "—" },
      ),
    accept ? t("accepted") : t("declined"),
  );
}

/** The artist marks a gig they performed as completed. */
export async function completeGigAction(assignmentId: string): Promise<ActionResult> {
  const viewer = await requirePermission("artist.gigs");
  const assignment = await prisma.bookingAssignment.findFirst({
    where: { ...liveAssignmentOf(viewer.user.id), id: assignmentId, status: "accepted" },
    select: { organizationId: true, bookingId: true },
  });
  if (!assignment) return { ok: false, message: (await getTranslations("bookingErrors"))("no_open_assignment") };
  const t = await getTranslations("gigs");
  return runAction(
    () => changeBookingStatus(assignment.organizationId, assignment.bookingId, "complete", { actor: "artist", actorId: viewer.user.id }).then(() => {}),
    t("completed"),
  );
}
