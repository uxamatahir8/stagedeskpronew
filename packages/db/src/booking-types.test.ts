import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { availableBookingTypes, BookingTypeError, deletePlatformBookingType, saveOrganizationBookingType, savePlatformBookingType } from "./booking-types";

const run = `bt${Date.now().toString(36)}`;
const org = `${run}-org`;
const user = `${run}-user`;

beforeAll(async () => {
  await prisma.user.create({ data: { id: user, name: "Type owner", email: `${run}@test.local` } });
  await prisma.organization.create({ data: { id: org, name: "Type agency", slug: org } });
});

afterAll(async () => {
  await prisma.bookingType.deleteMany({ where: { OR: [{ organizationId: org }, { key: { startsWith: run } }] } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.user.deleteMany({ where: { id: user } });
});

describe("booking types", () => {
  it("combines platform types with one agency's custom types", async () => {
    const row = await saveOrganizationBookingType(org, user, null, { key: `${run}-show`, nameNl: "Show", nameEn: "Show", active: true });
    const list = await availableBookingTypes(org);
    expect(list.map((x) => x.key)).toContain("wedding");
    expect(list.map((x) => x.id)).toContain(row.id);
  });

  it("does not expose an agency delete operation and protects wedding for admins", async () => {
    const wedding = await prisma.bookingType.findFirstOrThrow({ where: { key: "wedding", organizationId: null } });
    await expect(deletePlatformBookingType(wedding.id)).rejects.toMatchObject({ code: "protected" });
    const changed = await savePlatformBookingType(user, wedding.id, { key: "renamed", nameNl: "Bruiloft aangepast", nameEn: "Edited wedding", active: false });
    expect(changed).toMatchObject({ key: "wedding", active: true });
    await savePlatformBookingType(user, wedding.id, { key: wedding.key, nameNl: wedding.nameNl, nameEn: wedding.nameEn, active: true, position: wedding.position });
  });

  it("refuses a custom key that shadows a platform type", async () => {
    await expect(saveOrganizationBookingType(org, user, null, { key: "wedding", nameNl: "Dubbel", nameEn: "Duplicate", active: true })).rejects.toBeInstanceOf(BookingTypeError);
  });
});
