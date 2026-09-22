import { useState } from "react";
import { toast } from "sonner";

import { updateRow, useSaveRow } from "@/lib/db";

type ActivityEntry = { type: string; message: string; at: string };

type ConvertibleInquiry = {
  id: string;
  company: string | null;
  client_name: string;
  description: string;
  account_id: string | null;
  source: string;
  notes: string | null;
  expected_close_date: string | null;
  activity_log: ActivityEntry[];
};

/**
 * The one real action behind "client said yes" — shared by both places a
 * user can trigger it: the Inquiry's Client Approval section (the Basic
 * Quotation path, no formal Proposal record involved) and the Proposal
 * editor's "Client Accepted" button (the Meeting/Estimation/Proposal path).
 * Both call this so the resulting Deal — and the Inquiry's own state
 * afterward — are identical no matter which door you came in through.
 */
export function useConvertToDeal() {
  const createDeal = useSaveRow("deals", "Deal");
  const [pending, setPending] = useState(false);

  async function convertToDeal(opts: {
    inquiry: ConvertibleInquiry;
    dealValue: number;
    owner: string | null;
  }) {
    const { inquiry, dealValue, owner } = opts;
    setPending(true);
    try {
      const dealId = await createDeal.mutateAsync({
        title: `${inquiry.company ?? inquiry.client_name} — ${inquiry.description.slice(0, 60)}`,
        account_id: inquiry.account_id,
        value: dealValue,
        // Not "Lead" — by the time this runs, the client has already said
        // yes to a real quote or proposal, so the deal starts where it
        // truly is in the pipeline instead of redoing Lead/Contacted/
        // Qualified.
        stage: "Proposal",
        owner: owner || null,
        probability: 75,
        close_date: inquiry.expected_close_date,
        notes: `Converted from inquiry (${inquiry.source}). ${inquiry.notes ?? ""}`.trim(),
        inquiry_id: inquiry.id,
      });
      const now = new Date().toISOString();
      await updateRow("inquiries", inquiry.id, {
        status: "Deal Done",
        deal_id: dealId,
        client_approved: true,
        client_approved_at: now,
        owner: owner || null,
        activity_log: [
          ...(inquiry.activity_log ?? []),
          { type: "converted", message: "Converted to a Sales deal.", at: now },
        ],
      });
      toast.success("Converted to a deal.");
      return dealId;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to convert to deal");
      return null;
    } finally {
      setPending(false);
    }
  }

  return { convertToDeal, pending };
}
