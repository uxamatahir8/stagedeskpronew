import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export interface AuditInput {
  actorId: string | null;
  action: string;
  agencyId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  data?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Records an admin, money or access change. Never throws: a failed audit
 * write is logged rather than undoing the change it describes.
 */
export async function audit(input: AuditInput) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        agencyId: input.agencyId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] could not record", input.action, error);
  }
}
