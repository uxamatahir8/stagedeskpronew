"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ToastButton({ label, message }: { label: string; message: string }) {
  return (
    <Button variant="secondary" onClick={() => toast.success(message)}>
      {label}
    </Button>
  );
}
