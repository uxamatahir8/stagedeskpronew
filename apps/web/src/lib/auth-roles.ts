import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

/**
 * Better Auth's own organization actions (invite, remove member, update agency)
 * mapped onto StageDesk's organization roles. StageDesk features check
 * `can()` from @stagedesk/core; this only governs Better Auth's endpoints.
 * Shared with the client, so no server-only imports here.
 */
export const ac = createAccessControl(defaultStatements);

export const organizationRoles = {
  agency_owner: ac.newRole(ownerAc.statements),
  agency_admin: ac.newRole(adminAc.statements),
  agency_staff: ac.newRole(memberAc.statements),
  artist: ac.newRole(memberAc.statements),
  customer: ac.newRole(memberAc.statements),
};
