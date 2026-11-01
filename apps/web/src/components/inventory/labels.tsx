import { useTranslations } from "next-intl";
import type { EquipmentStage, EquipmentStatus } from "@stagedesk/core";
import { Pill } from "@/components/status-badge";

const statusTone: Record<EquipmentStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  available: "success",
  maintenance: "warning",
  defective: "danger",
  lost: "danger",
  retired: "neutral",
};

export function EquipmentStatusPill({ status }: { status: string }) {
  const t = useTranslations("inventory");
  return <Pill tone={statusTone[status as EquipmentStatus] ?? "neutral"}>{t(`status_${status as EquipmentStatus}`)}</Pill>;
}

const stageTone: Record<EquipmentStage, "success" | "warning" | "danger" | "neutral" | "info" | "brand"> = {
  none: "neutral",
  packing: "info",
  loading: "brand",
  out: "brand",
  returning: "warning",
  missing: "danger",
  complete: "success",
  unused: "neutral",
};

export function EquipmentStagePill({ stage }: { stage: EquipmentStage }) {
  const t = useTranslations("equipment");
  return <Pill tone={stageTone[stage]}>{t(`stage_${stage}`)}</Pill>;
}
