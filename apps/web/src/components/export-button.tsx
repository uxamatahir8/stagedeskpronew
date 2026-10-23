import { DownloadIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/** Downloads the agency's data of one kind as a CSV file. */
export async function ExportButton({ kind }: { kind: "bookings" | "customers" | "payments" }) {
  const t = await getTranslations("charts");
  return (
    <Button asChild variant="outline">
      <a href={`/api/export/${kind}`} download>
        <DownloadIcon />
        {t("exportCsv")}
      </a>
    </Button>
  );
}
