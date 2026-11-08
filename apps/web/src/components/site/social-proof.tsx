import { QuoteIcon } from "lucide-react";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { mediaEmbed } from "@stagedesk/core";
import { siteSettings } from "@/lib/site";

/**
 * Pilot agencies, their words and a note from the founder, as the platform
 * admin entered them (Settings → Website proof). Renders nothing while empty:
 * the site never shows proof that isn't real.
 */
export async function SocialProof() {
  await connection();
  const [t, locale, { proof }] = await Promise.all([getTranslations("socialProof"), getLocale(), siteSettings()]);
  const text = (nl: string, en: string) => (locale === "nl" ? nl || en : en || nl);
  const quotes = proof.quotes.filter((q) => text(q.textNl, q.textEn));
  const founderText = text(proof.founder.textNl, proof.founder.textEn);
  if (proof.logos.length === 0 && quotes.length === 0 && !founderText) return null;

  return (
    <section className="border-y bg-muted/30" aria-labelledby="social-proof">
      <div className="mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-20 sm:px-8 lg:px-12">
        <h2 id="social-proof" className="text-center text-3xl font-bold tracking-tight text-balance">
          {t("title")}
        </h2>

        {proof.logos.length > 0 && (
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6" aria-label={t("logos")}>
            {proof.logos.map((logo) => {
              const mark = logo.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo of any size
                <img src={logo.imageUrl} alt={logo.name} className="h-10 w-auto max-w-40 object-contain opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0" />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">{logo.name}</span>
              );
              return (
                <li key={logo.name}>
                  {logo.url ? (
                    <a href={logo.url} target="_blank" rel="noopener nofollow">
                      {mark}
                    </a>
                  ) : (
                    mark
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {quotes.length > 0 && (
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {quotes.map((q) => (
              <li key={`${q.name}-${q.role}`} className="grid content-between gap-6 rounded-2xl border bg-card p-6">
                <blockquote className="grid gap-3">
                  <QuoteIcon className="size-6 text-magenta" aria-hidden />
                  <p className="text-lg text-balance">{text(q.textNl, q.textEn)}</p>
                </blockquote>
                <Person name={q.name} role={q.role} photo={q.photoUrl} />
              </li>
            ))}
          </ul>
        )}

        {founderText && (
          <figure className="mx-auto grid max-w-3xl gap-5 rounded-2xl border bg-card p-8">
            <p className="text-sm font-medium text-magenta">{t("founder")}</p>
            <blockquote className="text-lg whitespace-pre-line">{founderText}</blockquote>
            {proof.founder.name && (
              <figcaption>
                <Person name={proof.founder.name} role={proof.founder.role} photo={proof.founder.photoUrl} />
              </figcaption>
            )}
          </figure>
        )}
      </div>
    </section>
  );
}

function Person({ name, role, photo }: { name: string; role: string; photo: string }) {
  return (
    <span className="flex items-center gap-3">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded portrait
        <img src={photo} alt="" className="size-11 rounded-full object-cover" />
      ) : null}
      <span className="grid">
        <span className="font-semibold">{name}</span>
        {role && <span className="text-sm text-muted-foreground">{role}</span>}
      </span>
    </span>
  );
}

/** The product video on the tour page, when the admin has added one. */
export async function TourVideo() {
  await connection();
  const [t, { proof }] = await Promise.all([getTranslations("socialProof"), siteSettings()]);
  const embed = proof.tourVideoUrl ? mediaEmbed(proof.tourVideoUrl) : null;
  if (!embed || (embed.provider !== "youtube" && embed.provider !== "vimeo")) return null;
  return (
    <div className="mt-6 aspect-video w-full max-w-4xl overflow-hidden rounded-3xl border shadow-2xl shadow-primary/20">
      <iframe src={embed.embedUrl} title={t("video")} className="size-full" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
    </div>
  );
}
