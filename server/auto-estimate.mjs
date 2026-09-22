import { createRow, listRows, nextDisplayId } from "./db.mjs";
import { buildProposalDraft } from "./proposal-lib.mjs";
import { COMPLEXITY_RATE_KEY } from "./inquiry-mail.mjs";

/**
 * The simple version of "hours in, quote and proposal draft out": if an
 * inquiry has an Estimated Hours figure on it and doesn't already have a
 * Quote, this creates one automatically the moment the Basic Quotation
 * email goes out — hours × the complexity-tier rate + the same 30% default
 * margin the manual Quote calculator uses — then drafts a Proposal from it
 * with buildProposalDraft, the same server-side composer the "New proposal"
 * button already calls by hand.
 *
 * Both land as Drafts, exactly as if a person had clicked "Create proposal"
 * then "New proposal" themselves — nothing here ever emails or sends
 * anything to the client. "Send to client" on the Proposal page stays the
 * one deliberate, manual step; this just removes the two clicks that used
 * to happen before it.
 */
export async function autoEstimateFromInquiry(inquiry, company) {
  const hours = Number(inquiry.estimated_hours) || 0;
  if (hours <= 0) return null;

  const existingQuotes = (await listRows("quotes")).filter((q) => q.inquiry_id === inquiry.id);
  if (existingQuotes.length > 0) return null; // already estimated — don't create a duplicate

  const complexity = ["Simple", "Medium", "Complex"].includes(inquiry.complexity)
    ? inquiry.complexity
    : "Medium";
  const rate = Number(company?.[COMPLEXITY_RATE_KEY[complexity]] ?? 0);
  if (!rate) return null; // no rate configured for this tier yet — nothing to compute off of

  const margin = 30;
  const costBasis = Math.round(hours * rate * 100) / 100;
  const suggestedPrice = Math.round(costBasis * (1 + margin / 100) * 100) / 100;
  const marginAmount = Math.round((suggestedPrice - costBasis) * 100) / 100;

  const quote = await createRow("quotes", {
    title: `${inquiry.client_name} — Quote`,
    client: inquiry.company || inquiry.client_name,
    project_id: null,
    inquiry_id: inquiry.id,
    deal_id: null,
    owner: inquiry.owner ?? null,
    estimated_hours: hours,
    margin_percent: margin,
    rate_used: rate,
    cost_basis: costBasis,
    suggested_price: suggestedPrice,
    margin_amount: marginAmount,
    status: "Draft",
    notes: "Auto-created from the inquiry's Estimated Hours when the Basic Quotation went out.",
  });

  const draft = buildProposalDraft({
    inquiry,
    quote,
    company,
    template: "Custom Software Development",
  });
  const display_id = await nextDisplayId("PROP");
  const proposal = await createRow("proposals", {
    ...draft,
    display_id,
    inquiry_id: inquiry.id,
    title: `${inquiry.client_name} — Proposal`,
    template: "Custom Software Development",
    version: 1,
    status: "Draft",
    owner: inquiry.owner ?? null,
    client_email: inquiry.email ?? null,
  });

  return { quote, proposal };
}
