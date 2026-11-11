import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownAgencyArtistProfiles, setOwnArtistPhoto, updateOwnArtistProfile } from "./artist-self";
import { prisma } from "./client";

/** Agency and managed artists edit how they're presented; nothing else, and only their own profile while they're still the artist there. */
const run = `as${Date.now().toString(36)}`;
const agency = `${run}-agency`;
const other = `${run}-other`;
const me = `${run}-me`;
const someone = `${run}-someone`;
const profile = `${run}-p`;
const theirs = `${run}-theirs`;
const input = { stageName: " DJ Nieuw ", bio: "Bruiloften en feesten", genres: "house, disco", mediaLinks: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };

beforeAll(async () => {
  await prisma.organization.createMany({ data: [{ id: agency, name: "Agency", slug: `${run}-a` }, { id: other, name: "Other", slug: `${run}-b` }] });
  await prisma.user.createMany({ data: [{ id: me, name: "Me", email: `${me}@test.local` }, { id: someone, name: "Someone", email: `${someone}@test.local` }] });
  await prisma.member.createMany({ data: [{ id: `${run}-m1`, organizationId: agency, userId: me, role: "artist" }, { id: `${run}-m2`, organizationId: other, userId: someone, role: "artist" }] });
  await prisma.artist.createMany({
    data: [
      { id: profile, organizationId: agency, userId: me, stageName: "DJ Oud", genres: [], defaultShareBps: 4_000 },
      { id: theirs, organizationId: other, userId: someone, stageName: "Other DJ", genres: [] },
    ],
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [agency, other] } } });
  await prisma.user.deleteMany({ where: { id: { in: [me, someone] } } });
});

describe("an artist's own agency profile", () => {
  it("lists and updates the presentation, and leaves pay alone", async () => {
    expect((await ownAgencyArtistProfiles(me)).map((p) => p.id)).toEqual([profile]);
    await updateOwnArtistProfile(me, profile, input);
    expect(await prisma.artist.findUniqueOrThrow({ where: { id: profile } })).toMatchObject({ stageName: "DJ Nieuw", bio: "Bruiloften en feesten", genres: ["house", "disco"], defaultShareBps: 4_000 });
    expect(await setOwnArtistPhoto(me, profile, "/files/new.jpg")).toBeNull();
  });

  it("refuses someone else's profile, unsafe media and a lost artist role", async () => {
    await expect(updateOwnArtistProfile(me, theirs, input)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateOwnArtistProfile(me, profile, { ...input, mediaLinks: "https://evil.example/x" })).rejects.toMatchObject({ code: "invalid_media" });
    await prisma.member.update({ where: { id: `${run}-m1` }, data: { role: "customer" } });
    expect(await ownAgencyArtistProfiles(me)).toEqual([]);
    await expect(updateOwnArtistProfile(me, profile, input)).rejects.toMatchObject({ code: "not_found" });
  });
});
