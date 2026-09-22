import { esc, urlHref, emailShell, infoCard, ctaButton, keyValueRows } from "./email-shell.mjs";

// Where the frontend is actually reachable — override in production via
// .env; defaults to the local Vite dev server so tracking links still work
// out of the box in development.
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

// The "Inquiry link" the workflow diagram calls for — a no-login status
// page a client can bookmark, keyed by the inquiry's internal (unguessable)
// id rather than its sequential display_id.
function trackingLinkHtml(inquiry) {
  if (!inquiry?.id) return "";
  return ctaButton("Track your inquiry", `${FRONTEND_URL}/track/${inquiry.id}`);
}

// The "About Us" links block — company profile, services/catalogue,
// portfolio, legal docs — only renders links that are actually configured on
// the Company Profile, never fabricated URLs.
function aboutUsLinksHtml(company) {
  const links = [
    company?.website ? ["Company profile", urlHref(company.website)] : null,
    company?.services_url ? ["Services & catalogue", urlHref(company.services_url)] : null,
    company?.portfolio_url ? ["Portfolio", urlHref(company.portfolio_url)] : null,
    company?.legal_docs_url ? ["Terms & legal docs", urlHref(company.legal_docs_url)] : null,
  ].filter(Boolean);
  if (!links.length) return "";
  return infoCard({
    eyebrow: "Learn more about us",
    html: links
      .map(
        ([label, href]) =>
          `<a href="${esc(href)}" style="display:inline-block;font-size:13px;color:#0f172a;font-weight:600;margin:0 16px 4px 0;">${esc(label)} →</a>`,
      )
      .join(""),
  });
}

function meetingCtaHtml(company) {
  return ctaButton("Request a meeting", company?.meeting_link ? urlHref(company.meeting_link) : "");
}

/**
 * Email 1 of 3, instant — a deliberately bare acknowledgment. No links, no
 * buttons, nothing to click — just confirmation that the message arrived
 * and a reference number, the way a receipt works. Everything else (links,
 * pricing, company info) lives in Email 2, thirty minutes later, on
 * purpose — a first-touch email that only asks to be read, not acted on,
 * reads as more professional than one front-loaded with five different CTAs.
 */
export function buildInquiryThankYouEmail(inquiry, company) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const tagline = company?.tagline || "";
  const phone = company?.phone || "";
  const email = company?.email || "";
  const inquiryNumber = inquiry.display_id || "on file";

  const subject = `Thanks for reaching out to ${displayName}, ${inquiry.client_name} (${inquiryNumber})`;

  const body = `
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em;">Hi ${esc(inquiry.client_name)},</p>
    <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.6;">
      Thanks for getting in touch with ${esc(displayName)}${tagline ? ` — ${esc(tagline)}` : ""}.
      We've received your message and someone from our team will get back to you within
      one business day.
    </p>

    ${infoCard({
      eyebrow: "Your inquiry",
      accent: true,
      html: `<table width="100%" cellpadding="0" cellspacing="0">${keyValueRows([
        ["Reference number", inquiryNumber],
        ["Company", inquiry.company],
        ["Industry", inquiry.industry],
        ["Message", inquiry.description],
      ])}</table>`,
    })}

    <p style="font-size:13px;color:#374151;margin:0 0 4px;">If anything's urgent, you can also reach us directly:</p>
    ${phone ? `<p style="font-size:13px;color:#111827;margin:0;">Phone: ${esc(phone)}</p>` : ""}
    ${email ? `<p style="font-size:13px;color:#111827;margin:0 0 20px;">Email: ${esc(email)}</p>` : ""}

    <p style="font-size:14px;color:#111827;margin:0;">
      Talk soon,<br/><strong>The ${esc(displayName)} Team</strong>
    </p>`;

  const html = emailShell({
    displayName,
    tagline,
    preheader: `We've received your inquiry (${inquiryNumber}) — here's what happens next.`,
    bodyHtml: body,
    footerNote: `This is an automated message from ${displayName} — sent because you submitted an inquiry to us. Your reference number is ${inquiryNumber}.`,
  });

  return { subject, html };
}

export const COMPLEXITY_RATE_KEY = {
  Simple: "rate_simple",
  Medium: "rate_medium",
  Complex: "rate_complex",
};

/**
 * The tiered "Basic Quotation" fast-path email — a rough $/hr figure based
 * on a quick complexity call, sent before any real estimation work happens.
 * Rates are read from the real Company Profile settings, never hardcoded.
 */
/**
 * Email 2 of 3, thirty minutes after the bare receipt — this is where all
 * the substance lives: how you work, a ballpark rate, the fine print, every
 * real link you've configured (About Us / services / portfolio / legal),
 * the refund policy, and a way to book a call. Deliberately the "detail and
 * links" email, on purpose, so Email 1 could stay a clean acknowledgment.
 */
export function buildBasicQuotationEmail(inquiry, company) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const complexity = ["Simple", "Medium", "Complex"].includes(inquiry.complexity)
    ? inquiry.complexity
    : "Medium";
  const rate = company?.[COMPLEXITY_RATE_KEY[complexity]];
  const inquiryNumber = inquiry.display_id || "on file";
  // If a rough hours estimate was captured on the inquiry, show a real
  // dollar ballpark (hours × rate, +30% — same default margin as the
  // Estimation calculator) instead of a bare $/hr rate, which is a much
  // more useful number for a client actually planning a budget.
  const hours = Number(inquiry.estimated_hours) || 0;
  const estimatedTotal = hours > 0 && rate ? Math.round(hours * rate * 1.3) : null;
  const subject = `More about your inquiry, plus a ballpark quote — ${displayName} (${inquiryNumber})`;

  const body = `
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em;">Hi ${esc(inquiry.client_name)},</p>
    <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.6;">
      Following up on reference <strong>${esc(inquiryNumber)}</strong> — here's a bit more about
      how we work, plus a fast, non-binding ballpark quote so you can plan ahead while we work
      out the full details.
    </p>

    ${
      company?.process_overview
        ? infoCard({
            eyebrow: "How we work",
            html: `<p style="font-size:13px;color:#374151;margin:0;line-height:1.6;">${esc(company.process_overview)}</p>`,
          })
        : ""
    }

    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:22px 20px;margin:0 0 16px;text-align:center;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:10px;letter-spacing:.06em;">
        Basic Quotation · ${esc(complexity)} complexity
      </div>
      ${
        estimatedTotal
          ? `<p style="font-size:32px;color:#0f172a;margin:0 0 6px;font-weight:800;letter-spacing:-.02em;">
               ~$${estimatedTotal.toLocaleString("en-US")}
             </p>
             <p style="font-size:12px;color:#94a3b8;margin:0;">
               Based on roughly ${hours} hour${hours === 1 ? "" : "s"} of work at our
               ${esc(complexity.toLowerCase())}-complexity rate — a ballpark, not a fixed
               project price. Final cost is confirmed in a formal proposal.
             </p>`
          : `<p style="font-size:32px;color:#0f172a;margin:0 0 6px;font-weight:800;letter-spacing:-.02em;">
               ${rate ? `$${rate}<span style="font-size:16px;font-weight:600;color:#64748b;">/hour</span>` : "Rate to be confirmed"}
             </p>
             <p style="font-size:12px;color:#94a3b8;margin:0;">
               A rate estimate, not a fixed project price — final cost depends on scope,
               timeline and requirements confirmed on a call.
             </p>`
      }
    </div>

    ${infoCard({
      eyebrow: "Terms & Conditions",
      html: `<p style="font-size:12px;color:#64748b;margin:0;line-height:1.6;">${esc(
        company?.quotation_terms ||
          "This is a preliminary rate estimate, not a fixed project price. Final cost, scope and timeline will be confirmed in a formal proposal, valid for 30 days from the date it's issued.",
      )}</p>`,
    })}

    ${trackingLinkHtml(inquiry)}
    ${meetingCtaHtml(company)}
    ${aboutUsLinksHtml(company)}

    ${
      company?.refund_policy
        ? infoCard({
            eyebrow: "Refund policy",
            html: `<p style="font-size:12px;color:#64748b;margin:0;line-height:1.6;">${esc(company.refund_policy)}</p>`,
          })
        : ""
    }

    <p style="font-size:14px;color:#111827;margin:0;">
      Best,<br/><strong>The ${esc(displayName)} Team</strong>
    </p>`;

  const html = emailShell({
    displayName,
    headerLabel: "More about us, and a ballpark quote",
    preheader: `A ballpark ${rate ? `$${rate}/hr` : ""} rate, plus links and detail for reference ${inquiryNumber}.`,
    bodyHtml: body,
    footerNote: `Automated message from ${displayName} — reference ${inquiryNumber}.`,
  });

  return { subject, html };
}

/**
 * The "Request for Meeting" auto-email — invites the client to book time
 * with us, using the real Company Profile meeting link if one is set.
 */
/**
 * Email 3 of 3, thirty minutes after the quotation (T+60 from the original
 * inquiry) — a short, direct ask for a call, now that the client has
 * already seen the detail and pricing in Email 2.
 */
export function buildMeetingRequestEmail(inquiry, company) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const inquiryNumber = inquiry.display_id || "on file";
  const subject = `Let's talk through your inquiry — ${displayName} (${inquiryNumber})`;

  const body = `
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em;">Hi ${esc(inquiry.client_name)},</p>
    <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.6;">
      To make sure we get your requirements exactly right, we'd like to set up a short call.
      It usually takes 20–30 minutes and helps us scope things accurately before we send over
      an estimate or proposal.
    </p>
    ${
      company?.meeting_link
        ? meetingCtaHtml(company)
        : `<p style="font-size:13px;color:#374151;margin:0 0 20px;">Reply to this email with a few times that work for you and we'll get it booked in.</p>`
    }
    <p style="font-size:13px;color:#374151;margin:0 0 20px;">
      Reference number: <strong>${esc(inquiryNumber)}</strong>
    </p>
    <p style="font-size:14px;color:#111827;margin:0;">
      Talk soon,<br/><strong>The ${esc(displayName)} Team</strong>
    </p>`;

  const html = emailShell({
    displayName,
    headerLabel: "Meeting request",
    preheader: "Let's set up a short call to scope your requirements accurately.",
    bodyHtml: body,
    footerNote: `Automated meeting request from ${displayName} — reference ${inquiryNumber}.`,
  });

  return { subject, html };
}

/**
 * The internal "new inquiry" ping sent to your own team the moment an
 * inquiry lands — separate from the client-facing thank-you, so someone
 * inside the company actually finds out a lead came in instead of it just
 * sitting in the CRM until someone opens the Inquiries tab.
 */
export function buildInternalAlertEmail(inquiry, company) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const subject = `New inquiry — ${inquiry.client_name}${inquiry.company ? ` (${inquiry.company})` : ""}`;

  const body = `
    <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.6;">
      A new inquiry just came in and needs a first response. The response-time clock has
      started.
    </p>
    ${infoCard({
      html: `<table width="100%" cellpadding="0" cellspacing="0">${keyValueRows([
        ["Client", inquiry.client_name],
        ["Company", inquiry.company],
        ["Email", inquiry.email],
        ["Phone", inquiry.phone],
        ["Source", inquiry.source],
        ["Assigned to", inquiry.owner],
        ["Message", inquiry.description],
      ])}</table>`,
    })}
    <p style="font-size:13px;color:#374151;margin:0;">Open the Inquiries tab in the CRM to review and respond.</p>`;

  const html = emailShell({
    displayName,
    headerLabel: "New inquiry received",
    preheader: `${inquiry.client_name}${inquiry.company ? ` (${inquiry.company})` : ""} just submitted an inquiry.`,
    bodyHtml: body,
    footerNote: `Internal notification from ${displayName} CRM.`,
  });

  return { subject, html };
}

/**
 * The final email — sent when Admin/Salesman explicitly sends a response
 * once an inquiry's details are complete — includes the full request
 * details as they stand at that point, plus a named point of contact.
 */
export function buildInquiryConfirmationEmail(inquiry, company) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const phone = company?.phone || "";
  const email = company?.email || "";
  const inquiryNumber = inquiry.display_id || "on file";

  const subject = `Following up on your inquiry — ${displayName} (${inquiryNumber})`;

  const ownerLine = inquiry.owner
    ? `${esc(inquiry.owner)} from our team will be your point of contact going forward and will follow up with next steps shortly.`
    : `Our team will follow up with next steps shortly.`;

  const body = `
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em;">Hi ${esc(inquiry.client_name)},</p>
    <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.6;">
      Thanks for your patience — here's a summary of what we have on file for your request.
    </p>

    ${infoCard({
      accent: true,
      html: `<table width="100%" cellpadding="0" cellspacing="0">${keyValueRows([
        ["Reference number", inquiryNumber],
        ["Company", inquiry.company],
        ["Service / industry", inquiry.industry],
        ["Preferred contact method", inquiry.preferred_contact_method],
        ["Message", inquiry.description],
      ])}</table>`,
    })}

    <p style="font-size:14px;color:#374151;margin:0 0 20px;line-height:1.6;">${ownerLine}</p>

    ${trackingLinkHtml(inquiry)}
    ${meetingCtaHtml(company)}
    ${aboutUsLinksHtml(company)}
    ${
      company?.refund_policy
        ? infoCard({
            eyebrow: "Refund policy",
            html: `<p style="font-size:12px;color:#64748b;margin:0;line-height:1.6;">${esc(company.refund_policy)}</p>`,
          })
        : ""
    }

    <p style="font-size:13px;color:#374151;margin:0 0 4px;">In the meantime, feel free to reach us:</p>
    ${phone ? `<p style="font-size:13px;color:#111827;margin:0;">Phone: ${esc(phone)}</p>` : ""}
    ${email ? `<p style="font-size:13px;color:#111827;margin:0 0 20px;">Email: <a href="mailto:${esc(email)}" style="color:#0f172a;">${esc(email)}</a></p>` : ""}

    <p style="font-size:14px;color:#111827;margin:0;">
      Best,<br/><strong>${inquiry.owner ? `${esc(inquiry.owner)}<br/>` : ""}${esc(displayName)}</strong>
    </p>`;

  const html = emailShell({
    displayName,
    headerLabel: "Following up on your inquiry",
    preheader: `A summary of your request, reference ${inquiryNumber}.`,
    bodyHtml: body,
    footerNote: `This is an automated message from ${displayName} — reference ${inquiryNumber}.`,
  });

  return { subject, html };
}

/**
 * Sent after a meeting, once minutes are recorded on the Meeting record —
 * the "Recorded Meeting & Minutes" email from the workflow: the recording
 * link (if any) plus structured discussion / decisions / action items.
 */
function meetingWhenLabel(meeting) {
  if (!meeting.starts_at) return null;
  const d = new Date(meeting.starts_at);
  if (Number.isNaN(d.getTime())) return null;
  const when = d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return meeting.duration_minutes ? `${when} · ${meeting.duration_minutes} min` : when;
}

/**
 * Sent once a meeting is marked Completed (automatically — see the meetings
 * PATCH handler in index.mjs) or on demand via "Send Minutes". Always
 * includes the basic meeting detail (what/when/who); the recording link and
 * the structured Discussion/Decisions/Action Items sections only render if
 * that data actually exists yet — a meeting can be marked Completed before
 * anyone's typed up notes, so this degrades gracefully instead of sending
 * an empty-looking "summary".
 */
export function buildMeetingMinutesEmail(meeting, company) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const subject = `Meeting summary — ${meeting.title}`;

  const sections = [
    ["Discussion", meeting.minutes_discussion],
    ["Decisions", meeting.minutes_decisions],
    ["Action items", meeting.minutes_action_items],
  ].filter(([, value]) => value);

  const whenLabel = meetingWhenLabel(meeting);
  const hasNotes = sections.length > 0;

  const body = `
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em;">Hi,</p>
    <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.6;">
      Thanks for joining <strong>${esc(meeting.title)}</strong>.
      ${hasNotes ? "Here's a summary of what we covered." : "Here's a quick recap — detailed notes will follow shortly."}
    </p>
    ${infoCard({
      eyebrow: "Meeting detail",
      html: `<table width="100%" cellpadding="0" cellspacing="0">${keyValueRows([
        ["Meeting", meeting.title],
        ["When", whenLabel],
        ["Attendees", meeting.attendees],
      ])}</table>`,
    })}
    ${meeting.recording_url ? ctaButton("Watch the recording", urlHref(meeting.recording_url)) : ""}
    ${sections
      .map(([label, value]) =>
        infoCard({
          eyebrow: label,
          html: `<p style="font-size:13px;color:#111827;margin:0;white-space:pre-line;line-height:1.6;">${esc(value)}</p>`,
        }),
      )
      .join("")}
    <p style="font-size:14px;color:#111827;margin:0;">
      Best,<br/><strong>The ${esc(displayName)} Team</strong>
    </p>`;

  const html = emailShell({
    displayName,
    headerLabel: "Meeting summary",
    preheader: hasNotes
      ? `Recap of ${meeting.title} — discussion, decisions and next steps.`
      : `A quick recap of ${meeting.title}.`,
    bodyHtml: body,
    footerNote: `Automated meeting summary from ${displayName}.`,
  });

  return { subject, html };
}
