"use client";

import { ImageUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { SettingValue } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { saveSettingAction, uploadProofImageAction } from "./actions";

type Proof = SettingValue<"site.proof">;
type Logo = Proof["logos"][number];
type Quote = Proof["quotes"][number];

const emptyLogo: Logo = { name: "", imageUrl: "", url: "" };
const emptyQuote: Quote = { textNl: "", textEn: "", name: "", role: "", photoUrl: "" };

/**
 * Real proof for the public website: pilot agency logos, quotes, a founder
 * note and the product video. Each part is hidden on the site while empty.
 */
export function SiteProofForm({ value }: { value: Proof }) {
  const t = useTranslations("siteProofSettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [logos, setLogos] = useState<Logo[]>(value.logos);
  const [quotes, setQuotes] = useState<Quote[]>(value.quotes);
  const [founder, setFounder] = useState(value.founder);
  const [video, setVideo] = useState(value.tourVideoUrl);

  function save() {
    const keep = {
      logos: logos.filter((l) => l.name.trim()),
      quotes: quotes.filter((q) => q.name.trim() && (q.textNl.trim() || q.textEn.trim())),
      founder,
      tourVideoUrl: video.trim(),
    };
    start(async () => {
      const r = await saveSettingAction("site.proof", keep);
      if (!r.ok) return void toast.error(t("invalid"));
      toast.success(r.message);
      setLogos(keep.logos);
      setQuotes(keep.quotes);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8">
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">{t("logosTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("logosHint")}</p>
          {logos.map((logo, i) => (
            <div key={i} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
              <FormField id={`logo-name-${i}`} label={t("logoName")}>
                <Input id={`logo-name-${i}`} value={logo.name} onChange={(e) => setLogos(logos.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))} />
              </FormField>
              <FormField id={`logo-url-${i}`} label={t("logoLink")}>
                <Input id={`logo-url-${i}`} value={logo.url} placeholder="https://" onChange={(e) => setLogos(logos.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))} />
              </FormField>
              <ImagePicker label={t("logoImage")} value={logo.imageUrl} onChange={(url) => setLogos(logos.map((l, j) => (j === i ? { ...l, imageUrl: url } : l)))} />
              <Button type="button" variant="ghost" size="icon" aria-label={t("remove")} onClick={() => setLogos(logos.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setLogos([...logos, emptyLogo])}>
            <PlusIcon /> {t("addLogo")}
          </Button>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">{t("quotesTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("quotesHint")}</p>
          {quotes.map((quote, i) => {
            const set = (patch: Partial<Quote>) => setQuotes(quotes.map((q, j) => (j === i ? { ...q, ...patch } : q)));
            return (
              <div key={i} className="grid gap-3 rounded-lg border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id={`quote-nl-${i}`} label={t("quoteNl")}>
                    <Textarea id={`quote-nl-${i}`} rows={3} value={quote.textNl} onChange={(e) => set({ textNl: e.target.value })} />
                  </FormField>
                  <FormField id={`quote-en-${i}`} label={t("quoteEn")}>
                    <Textarea id={`quote-en-${i}`} rows={3} value={quote.textEn} onChange={(e) => set({ textEn: e.target.value })} />
                  </FormField>
                </div>
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <FormField id={`quote-name-${i}`} label={t("personName")}>
                    <Input id={`quote-name-${i}`} value={quote.name} onChange={(e) => set({ name: e.target.value })} />
                  </FormField>
                  <FormField id={`quote-role-${i}`} label={t("personRole")}>
                    <Input id={`quote-role-${i}`} value={quote.role} placeholder={t("personRolePlaceholder")} onChange={(e) => set({ role: e.target.value })} />
                  </FormField>
                  <ImagePicker label={t("photo")} value={quote.photoUrl} onChange={(url) => set({ photoUrl: url })} />
                  <Button type="button" variant="ghost" size="icon" aria-label={t("remove")} onClick={() => setQuotes(quotes.filter((_, j) => j !== i))}>
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setQuotes([...quotes, emptyQuote])}>
            <PlusIcon /> {t("addQuote")}
          </Button>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">{t("founderTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("founderHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="founder-nl" label={t("founderNl")}>
              <Textarea id="founder-nl" rows={4} value={founder.textNl} onChange={(e) => setFounder({ ...founder, textNl: e.target.value })} />
            </FormField>
            <FormField id="founder-en" label={t("founderEn")}>
              <Textarea id="founder-en" rows={4} value={founder.textEn} onChange={(e) => setFounder({ ...founder, textEn: e.target.value })} />
            </FormField>
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <FormField id="founder-name" label={t("personName")}>
              <Input id="founder-name" value={founder.name} onChange={(e) => setFounder({ ...founder, name: e.target.value })} />
            </FormField>
            <FormField id="founder-role" label={t("personRole")}>
              <Input id="founder-role" value={founder.role} onChange={(e) => setFounder({ ...founder, role: e.target.value })} />
            </FormField>
            <ImagePicker label={t("photo")} value={founder.photoUrl} onChange={(url) => setFounder({ ...founder, photoUrl: url })} />
          </div>
        </section>

        <FormField id="tour-video" label={t("video")} hint={t("videoHint")}>
          <Input id="tour-video" value={video} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setVideo(e.target.value)} />
        </FormField>

        <Button className="w-fit" disabled={pending} onClick={save}>
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Upload an image (or clear it); shows a small preview. */
function ImagePicker({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const t = useTranslations("siteProofSettings");
  const input = useRef<HTMLInputElement>(null);
  const [uploading, start] = useTransition();
  function upload(file: File) {
    const form = new FormData();
    form.set("image", file);
    start(async () => {
      const r = await uploadProofImageAction(form);
      if (!r.ok) return void toast.error(r.message);
      onChange(r.url);
    });
  }
  return (
    <div className="flex items-center gap-2">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded image
        <img src={value} alt="" className="size-9 rounded border bg-white object-contain" />
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
        <ImageUpIcon /> {uploading ? t("uploading") : value ? t("replaceImage") : label}
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
          {t("clearImage")}
        </Button>
      )}
    </div>
  );
}
