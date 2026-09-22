import { jsPDF } from "jspdf/dist/jspdf.node.js";
import { esc, emailShell, infoCard, keyValueRows } from "./email-shell.mjs";

export const PROPOSAL_TEMPLATES = [
  "Website Development",
  "Mobile App Development",
  "ERP Development",
  "Custom Software Development",
  "Maintenance & Support",
];

/**
 * Drafts every proposal section from data that already exists on the real
 * inquiry/quote/company — not a live external AI call (no API key to assume
 * you have), but a genuine auto-draft built from your actual data, not
 * placeholder text. Every field it returns is editable before sending.
 *
 * The linked quote's structured Estimation data (Initial Scope, Tech Stack,
 * Deliverables, Milestones, Timeline) is the primary source — it's far
 * richer than anything on the inquiry itself, so this always prefers it
 * when it exists and only falls back to the inquiry's description.
 */
export function buildProposalDraft({ inquiry, quote, company, template }) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const clientName = inquiry?.client_name || "the client";
  const companyName = inquiry?.company || clientName;
  const description = inquiry?.description || "";
  const shortDesc = description.length > 220 ? `${description.slice(0, 220)}…` : description;

  const scope = quote?.initial_scope || description || "Scope to be confirmed with the client.";

  const techStack =
    Array.isArray(quote?.tech_stack) && quote.tech_stack.length
      ? quote.tech_stack.join(", ")
      : "To be finalized during the discovery phase.";

  const deliverables = (Array.isArray(quote?.deliverables) ? quote.deliverables : []).filter(
    (d) => d?.name,
  );
  const deliverablesText = deliverables.length
    ? deliverables.map((d) => `• ${d.name}${d.hours ? ` — ${d.hours}h` : ""}`).join("\n")
    : "A detailed deliverables breakdown will follow once the estimation is finalized.";

  const milestoneRows = (Array.isArray(quote?.milestones) ? quote.milestones : []).filter(
    (m) => m?.name,
  );
  const milestonesText = milestoneRows.length
    ? milestoneRows
        .map(
          (m) =>
            `• ${m.name}${m.due_date ? ` — target ${m.due_date}` : ""}${m.description ? `: ${m.description}` : ""}`,
        )
        .join("\n")
    : "Kickoff & Discovery — Design/Build — Review & Revisions — Final Delivery.";

  const hours = Number(quote?.estimated_hours ?? 0);
  const weeks = quote?.timeline_weeks;
  const timeline = weeks
    ? `Estimated at ${weeks} week${Number(weeks) === 1 ? "" : "s"}${hours ? ` (~${hours} hours of work)` : ""}, delivered in phases aligned with the milestones below.`
    : hours
      ? `Estimated at ${hours} hours of work, delivered in phases aligned with the milestones below.`
      : "Timeline to be confirmed once scope is finalized.";

  const price = Number(quote?.suggested_price ?? inquiry?.estimated_budget ?? 0);

  return {
    executive_summary: `${displayName} is pleased to submit this proposal to ${companyName} for ${template.toLowerCase()}. Based on our discussions, we understand ${clientName} is looking to ${shortDesc || "move forward with this engagement"}. This document outlines our proposed approach, scope, timeline and investment required to deliver this successfully.`,
    client_requirements: description || "Requirements to be confirmed with the client.",
    proposed_solution: `Our team recommends the following approach: ${scope}`,
    scope_of_work: scope,
    technology_stack: techStack,
    deliverables: deliverablesText,
    timeline,
    milestones: milestonesText,
    cost: price,
    payment_terms:
      "50% advance to commence work, 50% on delivery — unless otherwise agreed in writing.",
    terms_conditions:
      "This proposal is valid for 30 days from the date of issue. Changes to scope after acceptance may affect timeline and cost.",
    assumptions:
      "Client will provide timely feedback and access to required resources/stakeholders throughout the engagement.",
    exclusions:
      "Third-party licensing, hosting/infrastructure costs, and content creation are not included unless explicitly listed in Scope of Work.",
    contact_info: [company?.email, company?.phone].filter(Boolean).join(" · "),
  };
}

const SECTIONS = [
  ["Executive Summary", "executive_summary"],
  ["Client Requirements", "client_requirements"],
  ["Proposed Solution", "proposed_solution"],
  ["Scope of Work", "scope_of_work"],
  ["Technology Stack", "technology_stack"],
  ["Deliverables", "deliverables"],
  ["Project Timeline", "timeline"],
  ["Milestones", "milestones"],
  ["Payment Terms", "payment_terms"],
  ["Terms & Conditions", "terms_conditions"],
  ["Assumptions", "assumptions"],
  ["Exclusions", "exclusions"],
];

export function buildProposalPdf(proposal, company) {
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 16;
  const maxWidth = pageWidth - marginLeft * 2;
  let y = 0;

  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const accent = [79, 124, 255];

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setFillColor(...accent);
  doc.rect(0, 34, pageWidth, 1.2, "F");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(proposal.title || "Proposal", marginLeft, 16);
  doc.setFontSize(9.5);
  doc.setTextColor(200, 210, 225);
  doc.text(
    `${displayName}  ·  ${proposal.display_id ?? ""}  ·  v${proposal.version ?? 1}`,
    marginLeft,
    24,
  );
  y = 46;

  function addSection(title, text) {
    if (!text) return;
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setTextColor(...accent);
    doc.text(title, marginLeft, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginLeft, y + 2, pageWidth - marginLeft, y + 2);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 45);
    const lines = doc.splitTextToSize(String(text), maxWidth);
    for (const line of lines) {
      if (y > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, marginLeft, y);
      y += 5.4;
    }
    y += 6;
  }

  for (const [title, key] of SECTIONS) {
    addSection(title, proposal[key]);
  }

  if (y > pageHeight - 40) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginLeft, y, maxWidth, 26, 3, 3, "F");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("INVESTMENT", marginLeft + 8, y + 10);
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `$${Number(proposal.cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    marginLeft + 8,
    y + 20,
  );
  y += 34;

  if (proposal.contact_info) {
    doc.setFontSize(9);
    doc.setTextColor(120, 130, 145);
    doc.text(proposal.contact_info, marginLeft, y);
  }

  return doc;
}

export function buildProposalSentEmail(proposal, company) {
  const displayName = company?.display_name || company?.legal_name || "Time Global Tech";
  const subject = `Proposal — ${proposal.title} (${proposal.display_id ?? ""})`;

  const summaryRows = keyValueRows([
    ["Scope of work", proposal.scope_of_work],
    ["Technology stack", proposal.technology_stack],
    ["Deliverables", proposal.deliverables],
    ["Timeline", proposal.timeline],
  ]);

  const body = `
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em;">Hi,</p>
    <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.6;">
      Please find our proposal for <strong>${esc(proposal.title)}</strong> attached as a PDF.
      A short summary is below.
    </p>
    ${infoCard({
      accent: true,
      html: `<table width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>`,
    })}
    <div style="background:#0f172a;border-radius:12px;padding:20px 22px;margin:0 0 16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;letter-spacing:.06em;">Investment</div>
      <p style="font-size:26px;color:#fff;margin:0;font-weight:800;letter-spacing:-.01em;">
        $${Number(proposal.cost ?? 0).toLocaleString()}
      </p>
    </div>
    <p style="font-size:13px;color:#374151;margin:0 0 20px;">
      Happy to walk through any part of this on a call — just reply to this email.
    </p>
    <p style="font-size:14px;color:#111827;margin:0;">Best,<br/><strong>The ${esc(displayName)} Team</strong></p>`;

  const html = emailShell({
    displayName,
    headerLabel: `Proposal ${proposal.display_id ?? ""}`,
    preheader: `Your proposal for ${proposal.title} — $${Number(proposal.cost ?? 0).toLocaleString()}.`,
    bodyHtml: body,
    footerNote: `Sent from ${displayName} — proposal ${proposal.display_id ?? ""}, version ${proposal.version ?? 1}.`,
  });

  return { subject, html };
}
