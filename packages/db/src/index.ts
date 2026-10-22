export { prisma } from "./client";
export { getSetting, updateSetting } from "./settings";
export { tenantDb, tenantModels, TenantScopeError, type TenantDb } from "./tenant";
export * from "./generated/prisma/client";
