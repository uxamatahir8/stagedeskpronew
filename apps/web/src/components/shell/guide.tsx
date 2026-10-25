import { getTranslations } from "next-intl/server";
import type { Permission, Role } from "@stagedesk/core";
import { seenGuides } from "@stagedesk/db";
import { footerNavigationFor, navigationFor } from "@/config/navigation";
import { type GuideStep, GuideTour } from "./guide-tour";

/**
 * The tour for this person's panel: a welcome, every menu item they can use,
 * search, notifications and their account. Steps they've already seen are
 * left out, so a new menu item later becomes a short "what's new" tour.
 */
export async function Guide({ userId, permissions, role }: { userId: string; permissions: readonly Permission[]; role?: Role | null }) {
  const [t, tn, seen] = await Promise.all([getTranslations("guides"), getTranslations("nav"), seenGuides(userId)]);
  const items = [...navigationFor(permissions, role).flatMap((g) => g.items), ...footerNavigationFor(permissions)].filter((i) => t.has(`nav_${i.key}` as "nav_home"));
  const core: GuideStep[] = [
    ...items.map((i) => ({ id: `nav.${i.key}`, target: `[data-tour="nav-${i.key}"]`, title: tn(i.key as "home"), body: t(`nav_${i.key}` as "nav_home") })),
    { id: "search", target: '[data-tour="search"]', title: t("searchTitle"), body: t("searchBody") },
    { id: "notifications", target: '[data-tour="notifications"]', title: t("notificationsTitle"), body: t("notificationsBody") },
    { id: "account", target: '[data-tour="account"]', title: t("accountTitle"), body: t("accountBody") },
  ];
  const welcome: GuideStep = { id: "welcome", target: null, title: t("welcomeTitle"), body: t("welcomeBody") };
  const done: GuideStep = { id: "done", target: null, title: t("doneTitle"), body: t("doneBody") };
  const allSteps = [welcome, ...core, done];

  const firstTime = !seen.includes("welcome");
  const unseen = core.filter((s) => !seen.includes(s.id));
  const steps = firstTime ? allSteps : unseen.length > 0 ? [{ id: `whatsnew.${unseen.map((s) => s.id).join(".")}`.slice(0, 64), target: null, title: t("whatsNewTitle"), body: t("whatsNewBody") }, ...unseen] : [];
  return <GuideTour steps={steps} allSteps={allSteps} mode={firstTime ? "first" : steps.length > 0 ? "new" : null} />;
}
