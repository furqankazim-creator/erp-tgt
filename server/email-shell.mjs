// Shared visual chrome for every client-facing email this app sends —
// one look, in one place, instead of five copies of the same HTML string
// slowly drifting apart. Every builder in inquiry-mail.mjs and
// proposal-lib.mjs renders through this.

export function esc(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

export function urlHref(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

const ACCENT = "#4f7cff";

/**
 * The full email wrapper — a hidden preheader (the preview snippet inboxes
 * show before the email is opened), a dark header with a thin accent bar,
 * the body on a soft gray canvas, and a quiet footer. Every visible piece
 * of copy is passed in; nothing here is hardcoded per-email.
 */
export function emailShell({ displayName, tagline, headerLabel, preheader, bodyHtml, footerNote }) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;background:#f1f5f9;">
    ${
      preheader
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</div>`
        : ""
    }
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:28px 28px 22px;background:#0f172a;border-radius:14px 14px 0 0;">
        <span style="color:#fff;font-size:19px;font-weight:800;letter-spacing:-.01em;">${esc(displayName)}</span>
        <div style="color:#94a3b8;font-size:13px;margin-top:3px;">${esc(headerLabel || tagline || "")}</div>
      </td></tr>
      <tr><td style="height:4px;background:${ACCENT};line-height:0;font-size:0;">&nbsp;</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f1f5f9;">
      <tr><td style="padding:28px 24px;">${bodyHtml}</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:16px 24px 0;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.6;">
          ${esc(footerNote || `This is an automated message from ${displayName}.`)}
        </p>
      </td></tr>
    </table>
  </div>`;
}

/** A titled white card — the recurring "boxed section" pattern (what you
 * sent us / basic quotation / process overview / etc.). */
export function infoCard({ eyebrow, html, accent }) {
  return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin:0 0 16px;${accent ? `border-left:3px solid ${ACCENT};` : ""}">
    ${
      eyebrow
        ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px;letter-spacing:.06em;">${esc(eyebrow)}</div>`
        : ""
    }
    ${html}
  </div>`;
}

/** The one call-to-action button style used everywhere — solid, rounded,
 * an arrow to signal "this leaves the email." */
export function ctaButton(label, href) {
  if (!href) return "";
  return `<div style="margin:0 0 16px;">
    <a href="${esc(href)}" style="display:inline-block;background:${ACCENT};color:#fff;font-size:13px;font-weight:700;padding:12px 22px;border-radius:9px;text-decoration:none;">
      ${esc(label)} →
    </a>
  </div>`;
}

export function keyValueRows(pairs) {
  return pairs
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `<tr>
        <td style="padding:9px 0;border-top:1px solid #f1f5f9;color:#64748b;font-size:12px;white-space:nowrap;vertical-align:top;width:1%;padding-right:16px;">${esc(label)}</td>
        <td style="padding:9px 0;border-top:1px solid #f1f5f9;font-size:13px;color:#111827;line-height:1.5;">${esc(value)}</td>
      </tr>`,
    )
    .join("");
}
