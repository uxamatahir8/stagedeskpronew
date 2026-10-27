"use client";

import { MessageSquareIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { sendMessageAction } from "@/lib/message-actions";

/** Lets a customer ask the agency for a usable payment method from the payment card. */
export function RequestPaymentDetailsButton({ code, body, label, sentLabel }: { code: string; body: string; label: string; sentLabel: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function requestDetails() {
    startTransition(async () => {
      const result = await sendMessageAction(code, "customer", body);
      if (!result.ok) return void toast.error(result.message);
      setSent(true);
      toast.success(sentLabel);
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" className="w-fit" disabled={pending || sent} onClick={requestDetails}>
      <MessageSquareIcon />
      {sent ? sentLabel : label}
    </Button>
  );
}
