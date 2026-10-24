import { Suspense } from "react";
import type { Permission } from "@stagedesk/core";
import { getViewer } from "@/lib/viewer";

async function Gate({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const viewer = await getViewer();
  return viewer?.permissions.includes(permission) ? children : null;
}

/**
 * Shows its children only to people with the permission (the agency's own
 * settings included). The server action checks again; this just hides what
 * someone can't use.
 */
export function IfCan({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate permission={permission}>{children}</Gate>
    </Suspense>
  );
}
