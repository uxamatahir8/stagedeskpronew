export { prisma } from "./client";
export { getSetting, updateSetting } from "./settings";
export { tenantDb, tenantModels, TenantScopeError, type TenantDb } from "./tenant";
export * from "./bookings";
export * from "./inquiries";
export * from "./generated/prisma/client";
