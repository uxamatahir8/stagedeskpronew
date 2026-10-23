import "server-only";
import { todayInNetherlands } from "@stagedesk/core";
import { agencyFullyBookedDates, approvedReviews, prisma, publicArtists } from "@stagedesk/db";
import { turnstileSiteKey } from "./turnstile";

/**
 * Everything an agency site shows besides its sections: the agency's details
 * and its live artists, packages and reviews. Used by the public site and the
 * editor's preview, so both look the same.
 */
export async function loadSiteData(organizationId: string) {
  const today = todayInNetherlands();
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCMonth(horizon.getUTCMonth() + 18);
  const [agency, artists, packages, reviews, fullyBooked] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, slug: true, logo: true, city: true, contactEmail: true, phone: true, addressLine: true, postalCode: true, website: true },
    }),
    publicArtists(organizationId),
    prisma.serviceItem.findMany({ where: { organizationId, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true, unit: true, unitPriceCents: true, vatBps: true } }),
    approvedReviews(organizationId, 12),
    agencyFullyBookedDates(organizationId, today, horizon.toISOString().slice(0, 10)),
  ]);
  return {
    agency,
    artists: artists.map((a) => ({ id: a.id, stageName: a.stageName, photoUrl: a.photoUrl, bio: a.bio, genres: Array.isArray(a.genres) ? (a.genres as string[]) : [] })),
    // Prices are shown including VAT: customers are mostly consumers.
    packages: packages.map((p) => ({ id: p.id, name: p.name, description: p.description, unit: p.unit, priceCents: Math.round((p.unitPriceCents * (10_000 + p.vatBps)) / 10_000) })),
    reviews: { average: reviews.average, count: reviews.count, items: reviews.reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, author: r.customer?.name?.split(/\s+/)[0] ?? "" })) },
    booking: { slug: agency.slug, siteKey: turnstileSiteKey(), today, fullyBooked },
  };
}
export type SiteData = Awaited<ReturnType<typeof loadSiteData>>;
