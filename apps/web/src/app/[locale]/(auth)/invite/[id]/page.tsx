import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isRole } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/viewer";
import { InviteActions } from "./invite-actions";

export const metadata: Metadata = { robots: { index: false } };

// The invitation id is only known per request, so params are read inside Suspense.
export default function InvitePage({ params }: PageProps<"/[locale]/invite/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full max-w-sm" />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: Pick<PageProps<"/[locale]/invite/[id]">, "params">) {
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  // Invitation ids are long random strings; knowing one is what grants a look.
  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { organization: { select: { name: true } }, user: { select: { name: true } } },
  });

  const valid = invitation && invitation.status === "pending" && invitation.expiresAt > new Date();
  if (!valid) {
    return (
      <AuthCard title={t("auth.signIn.title")}>
        <FormMessage>{t("invite.invalid")}</FormMessage>
      </AuthCard>
    );
  }

  const agency = invitation.organization.name;
  const role = invitation.role && isRole(invitation.role) ? t(`roles.${invitation.role}`).toLowerCase() : "";
  const viewer = await getViewer();
  const next = `/invite/${id}`;

  return (
    <AuthCard
      title={t("invite.title", { agency })}
      description={t("invite.body", { inviter: invitation.user.name, email: invitation.email, role })}
    >
      {!viewer ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{t("invite.signInToAccept", { email: invitation.email })}</p>
          <Button asChild>
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>{t("invite.signIn")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/sign-up?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}&agency=${encodeURIComponent(agency)}`}
            >
              {t("invite.createAccount")}
            </Link>
          </Button>
        </div>
      ) : viewer.user.email.toLowerCase() !== invitation.email.toLowerCase() ? (
        <div className="grid gap-3">
          <FormMessage>{t("invite.wrongAccount", { current: viewer.user.email, email: invitation.email })}</FormMessage>
          <SignOutButton variant="outline" next={`/sign-in?next=${encodeURIComponent(next)}`}>
            {t("invite.switchAccount")}
          </SignOutButton>
        </div>
      ) : (
        <InviteActions invitationId={invitation.id} organizationId={invitation.organizationId} />
      )}
    </AuthCard>
  );
}
