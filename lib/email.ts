// Minimal transactional email module.
// Uses Resend's HTTP API (no extra dependency). When RESEND_API_KEY is not
// configured (local dev), emails are logged and reported as not-sent so the
// calling flow still succeeds. Only the four MAJOR-step emails are wired:
// invitation (phase released), submission confirmation, selection (offer),
// and rejection.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const FROM = process.env.EMAIL_FROM || "Neodym AI <no-reply@neodym.ai>";

export async function sendEmail(msg: EmailMessage): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`[email:disabled] to=${msg.to} subject="${msg.subject}"`);
    return { sent: false, error: "RESEND_API_KEY not set" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: `Resend ${res.status}: ${body}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function wrap(title: string, body: string): string {
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="font-weight:800;font-size:18px;color:#4f46e5;margin-bottom:12px">Neodym AI</div>
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#334155">${body}</div>
    <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0"/>
    <div style="font-size:12px;color:#94a3b8">This is an automated message from the Neodym AI recruitment portal.</div>
  </div>`;
}

export function inviteEmail(p: { to: string; name: string; driveName: string; stage: string; portalUrl: string }) {
  return sendEmail({
    to: p.to,
    subject: `Your ${p.stage} assessment is ready — ${p.driveName}`,
    html: wrap(
      `Hi ${p.name || "candidate"}, your next step is open`,
      `The <b>${p.stage}</b> stage for <b>${p.driveName}</b> is now available.<br/>
       Please log in to the candidate portal to begin.<br/><br/>
       <a href="${p.portalUrl}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open portal</a>`,
    ),
    text: `Hi ${p.name || "candidate"}, your ${p.stage} stage for ${p.driveName} is open. Visit ${p.portalUrl}`,
  });
}

export function submissionConfirmEmail(p: { to: string; name: string; driveName: string; stage: string }) {
  return sendEmail({
    to: p.to,
    subject: `Received: ${p.stage} submission — ${p.driveName}`,
    html: wrap(
      `Thanks, ${p.name || "candidate"}`,
      `We've received your <b>${p.stage}</b> submission for <b>${p.driveName}</b>.<br/>We'll notify you when the next step is ready.`,
    ),
    text: `We received your ${p.stage} submission for ${p.driveName}.`,
  });
}

export function selectionEmail(p: { to: string; name: string; driveName: string }) {
  return sendEmail({
    to: p.to,
    subject: `Congratulations — you've advanced for ${p.driveName}`,
    html: wrap(
      `Congratulations, ${p.name || "candidate"}!`,
      `We're pleased to let you know you have been <b>selected</b> to continue in the <b>${p.driveName}</b> process.<br/>Our team will reach out with next steps shortly.`,
    ),
    text: `Congratulations, you have been selected to continue in ${p.driveName}.`,
  });
}

export function rejectionEmail(p: { to: string; name: string; driveName: string }) {
  return sendEmail({
    to: p.to,
    subject: `Update on your application — ${p.driveName}`,
    html: wrap(
      `Thank you, ${p.name || "candidate"}`,
      `Thank you for your interest in <b>${p.driveName}</b> and for the time you invested.<br/>
       After careful review, we will not be moving forward with your application at this time.<br/>
       We wish you the very best in your career.`,
    ),
    text: `Thank you for your interest in ${p.driveName}. We will not be moving forward with your application at this time.`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export function onsiteInviteEmail(p: { to: string; name: string; driveName: string; scheduledAt: Date; location?: string; locationUrl?: string; notes?: string }) {
  const name = escapeHtml(p.name || "candidate");
  const drive = escapeHtml(p.driveName);
  const location = p.location ? escapeHtml(p.location) : "Location will be confirmed by the recruitment team";
  const locationLine = p.locationUrl
    ? `<a href="${escapeHtml(p.locationUrl)}">${location}</a>`
    : location;
  const notes = p.notes ? `<br/><br/><b>Instructions:</b> ${escapeHtml(p.notes)}` : "";
  const when = p.scheduledAt.toLocaleString("en", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });
  return sendEmail({
    to: p.to,
    subject: `Onsite screening invitation — ${p.driveName}`,
    html: wrap(
      `Onsite screening invitation for ${name}`,
      `You have been selected for an onsite screening for <b>${drive}</b>.<br/><br/>
       <b>Date and time:</b> ${when} UTC<br/>
       <b>Location:</b> ${locationLine}${notes}`,
    ),
    text: `You have been selected for an onsite screening for ${p.driveName}. Date: ${when} UTC. Location: ${p.location || "To be confirmed"}.${p.notes ? ` Instructions: ${p.notes}` : ""}`,
  });
}
