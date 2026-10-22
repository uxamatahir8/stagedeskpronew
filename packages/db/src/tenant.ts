import { Prisma } from "./generated/prisma/client";
import { prisma } from "./client";

/**
 * Models that belong to one agency (have an organizationId column).
 * Add every new tenant model here; the tenant tests check this list
 * against the schema so a model can't be forgotten.
 */
export const tenantModels = ["Member", "Invitation"] as const satisfies readonly Prisma.ModelName[];

const scopedReads = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const scopedWrites = new Set(["updateMany", "updateManyAndReturn", "deleteMany"]);
const creates = new Set(["create", "createMany", "createManyAndReturn"]);
// Operations addressed by a unique key can't be narrowed to one agency safely.
const refused = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`${model}.${operation} isn't allowed on a tenant-scoped client. Use findFirst, updateMany or deleteMany.`);
    this.name = "TenantScopeError";
  }
}

function withOrganization(data: Record<string, unknown>, organizationId: string) {
  const { organization: _ignored, ...rest } = data;
  return { ...rest, organizationId };
}

/**
 * A Prisma client where every query on a tenant model is limited to one
 * agency. Use this for all agency data; the plain `prisma` client is for
 * platform-level code (auth, platform admin) only.
 */
export function tenantDb(organizationId: string) {
  if (!organizationId) throw new Error("tenantDb needs an organizationId");

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!(tenantModels as readonly string[]).includes(model)) return query(args);

          if (refused.has(operation)) throw new TenantScopeError(model, operation);

          const a = (args ?? {}) as Record<string, unknown>;
          if (scopedReads.has(operation) || scopedWrites.has(operation)) {
            a["where"] = { AND: [a["where"] ?? {}, { organizationId }] };
            if (scopedWrites.has(operation) && a["data"] && typeof a["data"] === "object") {
              // Moving a row to another agency through an update isn't allowed either.
              const { organizationId: _moved, organization: _rel, ...data } = a["data"] as Record<string, unknown>;
              a["data"] = data;
            }
          } else if (creates.has(operation)) {
            const data = a["data"];
            a["data"] = Array.isArray(data)
              ? data.map((row) => withOrganization(row as Record<string, unknown>, organizationId))
              : withOrganization(data as Record<string, unknown>, organizationId);
          } else {
            throw new TenantScopeError(model, operation);
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
