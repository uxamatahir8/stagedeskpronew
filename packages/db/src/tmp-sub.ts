import { existsSync } from "node:fs";
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const { getStripe } = await import("../../payments/src/index");
const stripe = (await getStripe())!;
const s = await stripe.subscriptions.retrieve(process.argv[2]!);
console.log(s.items.data.map((i) => `${i.price.id} ${i.price.product} ${i.price.unit_amount}`), s.metadata);
