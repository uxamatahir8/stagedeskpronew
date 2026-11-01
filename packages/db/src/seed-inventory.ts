import { equipmentItemSchema } from "@stagedesk/core";
import type { PrismaClient } from "./generated/prisma/client";

/**
 * Demo equipment for the demo agencies: categories, numbered items, counted
 * cables, a mic case, a speaker set and a package. Fills only agencies that
 * have no equipment yet. Sharing stays off (the default).
 */
export async function seedInventory(prisma: PrismaClient, ownerIds: { feest: string; rot: string }) {
  const inv = await import("./inventory");
  const agencies = await prisma.organization.findMany({ where: { slug: { in: ["feestband-utrecht", "rotterdam-dj-collectief"] } }, select: { id: true, slug: true } });
  for (const org of agencies) {
    if (await prisma.equipmentItem.count({ where: { organizationId: org.id } })) {
      console.log(`  kept     equipment of ${org.slug}`);
      continue;
    }
    const owner = org.slug === "feestband-utrecht" ? ownerIds.feest : ownerIds.rot;
    const cat = new Map<string, string>();
    for (const name of ["Speakers", "Subwoofers", "Microfoons", "Licht", "DJ-sets", "Kabels", "Flightcases"]) {
      cat.set(name, (await inv.createCategory(org.id, name)).id);
    }
    const add = (input: Record<string, unknown>) => inv.createItem(org.id, equipmentItemSchema.parse(input), owner);

    const pair = await add({ code: "SET-1", name: "Speakerset links/rechts", kind: "set", categoryId: cat.get("Speakers") });
    await add({ code: "SPK-1", name: "Topspeaker links", manufacturer: "RCF", model: "ART 912-A", powerWatts: 1100, categoryId: cat.get("Speakers"), containerId: pair, serialNumber: "RCF-912-0041" });
    await add({ code: "SPK-2", name: "Topspeaker rechts", manufacturer: "RCF", model: "ART 912-A", powerWatts: 1100, categoryId: cat.get("Speakers"), containerId: pair, serialNumber: "RCF-912-0042" });
    await add({ code: "SPK-3", name: "Topspeaker", manufacturer: "RCF", model: "ART 912-A", powerWatts: 1100, categoryId: cat.get("Speakers") });
    await add({ code: "SPK-4", name: "Topspeaker", manufacturer: "RCF", model: "ART 912-A", powerWatts: 1100, categoryId: cat.get("Speakers") });
    await add({ code: "SUB-1", name: "Subwoofer", manufacturer: "RCF", model: "SUB 905-AS II", powerWatts: 2200, categoryId: cat.get("Subwoofers") });
    await add({ code: "SUB-2", name: "Subwoofer", manufacturer: "RCF", model: "SUB 905-AS II", powerWatts: 2200, categoryId: cat.get("Subwoofers") });
    const micCase = await add({ code: "CASE-1", name: "Microfooncase", kind: "case", categoryId: cat.get("Flightcases") });
    for (const n of [1, 2, 3, 4]) {
      await add({ code: `MIC-${n}`, name: n <= 2 ? "Draadloze microfoon" : "Microfoon", manufacturer: "Shure", model: n <= 2 ? "SLXD24/B58" : "SM58", batteryPowered: n <= 2, categoryId: cat.get("Microfoons"), containerId: micCase });
    }
    for (const n of [1, 2, 3, 4]) {
      await add({ code: `LED-${n}`, name: "LED-par", manufacturer: "Cameo", model: "Flat Pro 18", powerWatts: 180, categoryId: cat.get("Licht") });
    }
    await add({ code: "DJC-1", name: "DJ-controller", manufacturer: "Pioneer DJ", model: "DDJ-FLX10", powerWatts: 30, categoryId: cat.get("DJ-sets"), specs: [{ label: "Kanalen", value: "4" }] });
    const xlr = await add({ code: "XLR-10", name: "XLR-kabel 10 m", tracking: "bulk", quantity: 24, categoryId: cat.get("Kabels") });
    const power = await add({ code: "PWR-5", name: "Stroomkabel 5 m", tracking: "bulk", quantity: 16, categoryId: cat.get("Kabels") });

    await inv.savePackage(org.id, null, {
      name: "DJ-pakket A",
      description: "Bruiloft of feest tot 150 gasten",
      lines: [
        { itemId: null, categoryId: cat.get("Speakers")!, quantity: 2 },
        { itemId: null, categoryId: cat.get("DJ-sets")!, quantity: 1 },
        { itemId: micCase, categoryId: null, quantity: 1 },
        { itemId: null, categoryId: cat.get("Licht")!, quantity: 2 },
        { itemId: xlr, categoryId: null, quantity: 6 },
        { itemId: power, categoryId: null, quantity: 4 },
      ],
    });
    console.log(`  created  equipment of ${org.slug}`);
  }
}
