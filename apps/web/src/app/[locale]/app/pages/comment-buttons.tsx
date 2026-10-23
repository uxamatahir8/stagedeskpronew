"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { moderateCommentAction, publishVersionAction, restoreVersionAction, unpublishAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });
  return [pending, run] as const;
}

export function CommentButtons({ commentId }: { commentId: string }) {
  const t = useTranslations("pageBuilder");
  const [pending, run] = useRun();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => moderateCommentAction(commentId, "rejected"))}>
        <XIcon />
        {t("reject")}
      </Button>
      <Button size="sm" disabled={pending} onClick={() => run(() => moderateCommentAction(commentId, "approved"))}>
        <CheckIcon />
        {t("approve")}
      </Button>
    </div>
  );
}

export function VersionButtons({ pageId, versionId, live }: { pageId: string; versionId: string; live: boolean }) {
  const t = useTranslations("pageBuilder");
  const [pending, run] = useRun();
  return (
    <div className="flex flex-wrap gap-1">
      {!live && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => publishVersionAction(pageId, versionId))}>
          {t("publishThis")}
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => restoreVersionAction(pageId, versionId))}>
        {t("restore")}
      </Button>
    </div>
  );
}

export function UnpublishButton({ pageId }: { pageId: string }) {
  const t = useTranslations("pageBuilder");
  const [pending, run] = useRun();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => unpublishAction(pageId))}>
      {t("unpublish")}
    </Button>
  );
}
