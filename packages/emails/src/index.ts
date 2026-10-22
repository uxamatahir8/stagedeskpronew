import { render } from "@react-email/render";
import { createTransport, type Transporter } from "nodemailer";
import { createElement, type ReactElement } from "react";
import { copy, type EmailLocale } from "./copy";
import { InquiryReceived, Invitation, LoginCode, NewInquiry, QuoteSent, ResetPassword, VerifyEmail } from "./templates";

export type { EmailLocale } from "./copy";

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

async function send(to: string, subject: string, element: ReactElement) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  await getTransporter().sendMail({
    from: process.env["MAIL_FROM"] ?? "StageDesk <no-reply@stagedesk.local>",
    to,
    subject,
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
