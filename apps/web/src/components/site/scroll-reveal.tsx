"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * What counts as one piece that fades in on its own; nested matches move with
 * their parent. Icon badges (a span holding an svg) count too, so an icon
 * never sits there while its text is still fading in.
 */
const ITEMS = "h1, h2, h3, p, li, figure, img, article, details, form, dl, blockquote, [data-slot=card], [data-slot=button], span:has(> svg)";
const STEP_MS = 70;
const MAX_STEPS = 7;

/**
 * Fades the website's sections in as they scroll into view (and out again
 * once they've left it), their parts one after another. It only hides what
 * is below the fold when it starts, so nothing on screen ever flashes, and
 * does nothing for visitors who prefer reduced motion.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => {
      if (window.scrollY > 8) root.dataset.scrolled = "";
      else delete root.dataset.scrolled;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return () => window.removeEventListener("scroll", onScroll);

    // Top-level sections of the page (a section inside a section moves with its parent).
    const sections = [...document.querySelectorAll<HTMLElement>("main section")].filter((s) => !s.parentElement?.closest("main section"));
    for (const section of sections) {
      const items = [...section.querySelectorAll<HTMLElement>(ITEMS)].filter((el) => {
        const outer = el.parentElement?.closest(ITEMS);
        return !outer || !section.contains(outer);
      });
      items.forEach((el, i) => {
        el.dataset.revealItem = "";
        el.style.setProperty("--reveal-delay", `${Math.min(i, MAX_STEPS) * STEP_MS}ms`);
      });
      // Already on screen: shown straight away, without animating.
      const box = section.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) section.classList.add("is-visible");
    }
    root.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) entry.target.classList.toggle("is-visible", entry.isIntersecting);
      },
      // Fade in a little after the section's top edge appears; fade out once it has fully left.
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
      root.classList.remove("reveal-ready");
      for (const section of sections) {
        section.classList.remove("is-visible");
        section.querySelectorAll<HTMLElement>("[data-reveal-item]").forEach((el) => {
          delete el.dataset.revealItem;
          el.style.removeProperty("--reveal-delay");
        });
      }
    };
  }, [pathname]);

  return null;
}
