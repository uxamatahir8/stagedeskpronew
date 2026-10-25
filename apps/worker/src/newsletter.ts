import { campaignEmailContent, dueCampaigns, finishCampaignIfDone, markDelivery, nextDeliveries, startCampaign } from "@stagedesk/db";
import { sendNewsletter } from "@stagedesk/emails";

const appUrl = process.env["APP_URL"] ?? process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000";

/**
 * Sends a campaign: freezes the recipient list, then mails the queued
 * deliveries in batches, each in the subscriber's own language. Safe to run
 * again after a crash; a delivery is only ever sent once.
 */
export async function sendCampaign(campaignId: string) {
  const campaign = await startCampaign(campaignId);
  if (campaign.status === "sent") return { sent: 0 };
  const content = { nl: await campaignEmailContent(campaign, "nl", appUrl), en: await campaignEmailContent(campaign, "en", appUrl) };

  let sent = 0;
  for (;;) {
    const batch = await nextDeliveries(campaignId, 50);
    if (batch.length === 0) break;
    for (const d of batch) {
      const s = d.subscriber;
      // Someone who unsubscribed after the list was frozen gets nothing.
      if (s.status !== "subscribed") {
        await markDelivery(d.id, campaignId, { ok: false, error: "unsubscribed before sending" });
        continue;
      }
      const locale = s.locale === "en" ? "en" : "nl";
      try {
        await sendNewsletter(s.email, {
          locale,
          ...content[locale],
          // One address for mail apps' one-click POST and for people (redirected to the page).
          unsubscribeUrl: `${appUrl}/api/newsletter/unsubscribe?token=${s.token}&locale=${locale}`,
        });
        await markDelivery(d.id, campaignId, { ok: true });
        sent++;
      } catch (error) {
        await markDelivery(d.id, campaignId, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await finishCampaignIfDone(campaignId);
  return { sent };
}

/** Every minute: start scheduled campaigns whose time has come, and finish interrupted ones. */
export async function sendDueCampaigns() {
  const due = await dueCampaigns();
  let sent = 0;
  for (const c of due) sent += (await sendCampaign(c.id).catch((e) => (console.error("[newsletter]", c.id, e), { sent: 0 }))).sent;
  return { campaigns: due.length, sent };
}
