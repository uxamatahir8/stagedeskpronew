import "server-only";
import { mediaEmbed } from "@stagedesk/core";
import { approvedReviews, publicArtists } from "@stagedesk/db";
import type { BookingPageData } from "@/components/booking-page/booking-page-view";

const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

interface AgencyFields {
  id: string;
  name: string;
  logo: string | null;
  coverUrl: string | null;
  brandColor: string | null;
  bookingIntro: string | null;
  faq: unknown;
  showReviews: boolean;
  city: string | null;
  addressLine: string | null;
  postalCode: string | null;
  phone: string | null;
  contactEmail: string | null;
  website: string | null;
}

/** Everything the booking page shows, for the live page and the settings preview. */
export async function bookingPageData(agency: AgencyFields): Promise<BookingPageData> {
  const [artists, reviews] = await Promise.all([publicArtists(agency.id), agency.showReviews ? approvedReviews(agency.id) : Promise.resolve(null)]);
  const address = [agency.addressLine, [agency.postalCode, agency.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    name: agency.name,
    logo: agency.logo,
    coverUrl: agency.coverUrl,
    brandColor: agency.brandColor,
    intro: agency.bookingIntro ?? "",
    city: agency.city,
    address: address || null,
    phone: agency.phone,
    contactEmail: agency.contactEmail,
    website: agency.website,
    faq: asList<{ question: string; answer: string }>(agency.faq).filter((f) => f.question && f.answer),
    artists: artists.map((a) => ({
      id: a.id,
      stageName: a.stageName,
      photoUrl: a.photoUrl,
      genres: asList<string>(a.genres),
      bio: a.bio,
      media: asList<string>(a.mediaLinks).map(mediaEmbed).find((m) => m !== null) ?? null,
    })),
    reviews: reviews && {
      average: reviews.average,
      count: reviews.count,
      items: reviews.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        author: r.customer.name.split(" ")[0] ?? "",
        artist: r.artist?.stageName ?? null,
      })),
    },
  };
}
