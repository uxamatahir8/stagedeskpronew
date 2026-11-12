"use client";

import {
  AlignLeftIcon,
  BarChart3Icon,
  BuildingIcon,
  CalendarCheckIcon,
  ColumnsIcon,
  type LucideIcon,
  ImagesIcon,
  LayoutGridIcon,
  ListOrderedIcon,
  MailIcon,
  MegaphoneIcon,
  MessageSquareQuoteIcon,
  MicIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  TagIcon,
  UsersIcon,
  VideoIcon,
  CircleHelpIcon,
  PanelTopIcon,
  MousePointerClickIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type SectionType, sectionGroups } from "@stagedesk/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const sectionIcons: Record<SectionType, LucideIcon> = {
  hero: PanelTopIcon,
  banner: MegaphoneIcon,
  text: AlignLeftIcon,
  split: ColumnsIcon,
  highlights: SparklesIcon,
  cards: LayoutGridIcon,
  stats: BarChart3Icon,
  steps: ListOrderedIcon,
  team: UsersIcon,
  logos: BuildingIcon,
  divider: MinusIcon,
  artists: MicIcon,
  packages: PackageIcon,
  reviews: StarIcon,
  pricing: TagIcon,
  testimonials: MessageSquareQuoteIcon,
  gallery: ImagesIcon,
  video: VideoIcon,
  faq: CircleHelpIcon,
  cta: MousePointerClickIcon,
  booking: CalendarCheckIcon,
  contact: MailIcon,
};

/** The add-section dialog: every block, grouped, with a line on what it's for. */
export function SectionGallery({ onAdd, disabled }: { onAdd: (type: SectionType) => void; disabled?: boolean }) {
  const t = useTranslations("websiteEditor");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <PlusIcon />
          {t("addSection")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-4rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("addSection")}</DialogTitle>
          <DialogDescription>{t("addSectionHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          {Object.entries(sectionGroups).map(([group, types]) => (
            <section key={group} className="grid gap-2">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t(`group_${group as keyof typeof sectionGroups}`)}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {types.map((type) => {
                  const Icon = sectionIcons[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        onAdd(type);
                        setOpen(false);
                      }}
                      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="grid gap-0.5">
                        <span className="text-sm font-medium">{t(`section_${type}`)}</span>
                        <span className="text-xs text-muted-foreground">{t(`sectionHint_${type}`)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
