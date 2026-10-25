import "server-only";
import { Queue } from "bullmq";
import { redis } from "./redis";

const globalForQueue = globalThis as unknown as { systemQueue?: Queue };

/** The worker's "system" queue, for jobs the admin starts by hand (e.g. sending a newsletter now). */
export const systemQueue = (globalForQueue.systemQueue ??= new Queue("system", { connection: redis }));
