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

/** Who is really behind the current request when an admin is logged in as someone else; null otherwise. */
type ImpersonatorLookup = () => Promise<string | null>;
let currentImpersonator: ImpersonatorLookup = async () => null;

/**
 * Lets the web app tell audit() about "log in as" sessions, so every change
 * made meanwhile names the admin too, without each caller passing it along.
 */
export function setImpersonatorLookup(lookup: ImpersonatorLookup) {
  currentImpersonator = lookup;
}

/**
 * Records an admin, money or access change. Never throws: a failed audit
 * write is logged rather than undoing the change it describes.
 */
export async function audit(input: AuditInput) {
  try {
    // Outside a request (the worker, scripts) there is nobody to look up.
    const impersonatorId = await currentImpersonator().catch(() => null);
    await prisma.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        agencyId: input.agencyId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip ?? null,
        impersonatorId: impersonatorId === input.actorId ? null : impersonatorId,
      },
    });
  } catch (error) {
    console.error("[audit] could not record", input.action, error);
  }
}
