import { AsyncLocalStorage } from "node:async_hooks";
import { render } from "@react-email/render";
import { createTransport, type Transporter } from "nodemailer";
import { createElement, type ReactElement } from "react";
import { copy, type EmailLocale } from "./copy";
import {
  AffiliateApproved,
  AffiliatePayout,
  AgencyCreated,
  BalanceDue,
  ContactMessage,
  EventReminder,
  GigReminder,
  InquiryReceived,
  Invitation,
  LoginCode,
  NewInquiry,
  NewMessage,
  QuoteExpiring,
  QuoteSent,
  ResetPassword,
  TicketReply,
  VerifyEmail,
} from "./templates";

export type { EmailLocale } from "./copy";
export { emailSamples } from "./samples";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Set while previewing: `send` hands the rendered email here instead of mailing it. */
const previewing = new AsyncLocalStorage<(email: RenderedEmail) => void>();

let transporter: Transporter | undefined;

function getTransporter() {
  transporter ??= createTransport({
    host: process.env["SMTP_HOST"] ?? "localhost",
    port: Number(process.env["SMTP_PORT"] ?? 1025),
    secure: Number(process.env["SMTP_PORT"]) === 465,
    auth: process.env["SMTP_USER"] ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASSWORD"] } : undefined,
  });
  return transporter;
}

async function send(to: string, subject: string, element: ReactElement, replyTo?: string) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const capture = previewing.getStore();
  if (capture) return capture({ subject, html, text });
  await getTransporter().sendMail({
    from: process.env["MAIL_FROM"] ?? "StageDesk <no-reply@stagedesk.local>",
    to,
    subject,
    ...(replyTo ? { replyTo } : {}),
    html,
    text,
  });
}

export function sendVerifyEmail(to: string, p: { locale: EmailLocale; name: string; url: string }) {
  return send(to, copy[p.locale].verify.subject, createElement(VerifyEmail, p));
}

export function sendLoginCode(to: string, p: { locale: EmailLocale; code: string }) {
  return send(to, copy[p.locale].code.subject(p.code), createElement(LoginCode, p));
}

export function sendResetPassword(to: string, p: { locale: EmailLocale; name: string; url: string }) {
  return send(to, copy[p.locale].reset.subject, createElement(ResetPassword, p));
}

export function sendInquiryReceived(to: string, p: { locale: EmailLocale; name: string; agency: string; code: string; url: string }) {
  return send(to, copy[p.locale].inquiryReceived.subject(p.agency), createElement(InquiryReceived, p));
}

export function sendNewInquiry(to: string, p: { locale: EmailLocale; customer: string; event: string; date: string; url: string }) {
  return send(to, copy[p.locale].newInquiry.subject(p.customer), createElement(NewInquiry, p));
}

export function sendQuote(
  to: string,
  p: { locale: EmailLocale; name: string; agency: string; total: string; until: string; url: string },
) {
  return send(to, copy[p.locale].quoteSent.subject(p.agency), createElement(QuoteSent, p));
}

export function sendInvitation(
  to: string,
  p: { locale: EmailLocale; agency: string; inviter: string; role: string; url: string },
) {
  return send(to, copy[p.locale].invitation.subject(p.agency), createElement(Invitation, p));
}

export function sendAffiliateApproved(to: string, p: { locale: EmailLocale; name: string; link: string; promo: string; url: string }) {
  return send(to, copy[p.locale].affiliateApproved.subject, createElement(AffiliateApproved, p));
}

export function sendAffiliatePayout(to: string, p: { locale: EmailLocale; name: string; amount: string; lines: string[]; url: string }) {
  return send(to, copy[p.locale].affiliatePayout.subject(p.amount), createElement(AffiliatePayout, p));
}

/** Cuts a message for an email preview without breaking a word. */
const excerpt = (text: string, max = 400) => (text.length <= max ? text : `${text.slice(0, text.lastIndexOf(" ", max) > 0 ? text.lastIndexOf(" ", max) : max)}…`);

export function sendNewMessage(to: string, p: { locale: EmailLocale; name: string; code: string; excerpt: string; url: string }) {
  return send(to, copy[p.locale].newMessage.subject(p.name), createElement(NewMessage, { ...p, excerpt: excerpt(p.excerpt) }));
}

export function sendEventReminder(to: string, p: { locale: EmailLocale; days: number; name: string; event: string; date: string; agency: string; url: string }) {
  return send(to, copy[p.locale].eventReminder.subject(p.days), createElement(EventReminder, p));
}

export function sendGigReminder(to: string, p: { locale: EmailLocale; name: string; event: string; date: string; venue: string; url: string }) {
  return send(to, copy[p.locale].gigReminder.subject(p.date), createElement(GigReminder, p));
}

export function sendQuoteExpiring(to: string, p: { locale: EmailLocale; name: string; agency: string; until: string; url: string }) {
  return send(to, copy[p.locale].quoteExpiring.subject(p.agency), createElement(QuoteExpiring, p));
}

export function sendBalanceDue(to: string, p: { locale: EmailLocale; name: string; amount: string; date: string; agency: string; url: string }) {
  return send(to, copy[p.locale].balanceDue.subject(p.amount), createElement(BalanceDue, p));
}

export function sendTicketReply(to: string, p: { locale: EmailLocale; name: string; ref: string; subject: string; excerpt: string; url: string }) {
  return send(to, copy[p.locale].ticketReply.subject(p.ref, p.subject), createElement(TicketReply, { ...p, excerpt: excerpt(p.excerpt) }));
}

export function sendContactMessage(to: string, p: { locale: EmailLocale; name: string; email: string; company: string; message: string }) {
  return send(to, copy[p.locale].contactMessage.subject(p.name), createElement(ContactMessage, p), p.email);
}

export function sendAgencyCreated(to: string, p: { locale: EmailLocale; name: string; agency: string; url: string }) {
  return send(to, copy[p.locale].agencyCreated.subject(p.agency), createElement(AgencyCreated, p));
}

/**
 * Every email the app sends, by name. Web and worker describe an email as a
 * job ({ kind, to, params }); the worker's email queue sends it with retries.
 */
const senders = {
  verifyEmail: sendVerifyEmail,
  loginCode: sendLoginCode,
  resetPassword: sendResetPassword,
  inquiryReceived: sendInquiryReceived,
  newInquiry: sendNewInquiry,
  quote: sendQuote,
  invitation: sendInvitation,
  affiliateApproved: sendAffiliateApproved,
  affiliatePayout: sendAffiliatePayout,
  newMessage: sendNewMessage,
  eventReminder: sendEventReminder,
  gigReminder: sendGigReminder,
  quoteExpiring: sendQuoteExpiring,
  balanceDue: sendBalanceDue,
  ticketReply: sendTicketReply,
  contactMessage: sendContactMessage,
  agencyCreated: sendAgencyCreated,
} as const;

export type EmailKind = keyof typeof senders;
export type EmailJob = { [K in EmailKind]: { kind: K; to: string; params: Parameters<(typeof senders)[K]>[1] } }[EmailKind];

export function sendEmailJob(job: EmailJob) {
  const sender = senders[job.kind] as (to: string, params: EmailJob["params"]) => Promise<void>;
  return sender(job.to, job.params);
}

/** Renders an email exactly as it would be sent, without sending it (admin previews). */
export async function previewEmailJob(job: EmailJob): Promise<RenderedEmail> {
  let rendered: RenderedEmail | undefined;
  await previewing.run((email) => void (rendered = email), () => sendEmailJob(job));
  if (!rendered) throw new Error(`Email ${job.kind} rendered nothing`);
  return rendered;
}

/** Name of the BullMQ queue the worker reads emails from. */
export const EMAIL_QUEUE = "email";
