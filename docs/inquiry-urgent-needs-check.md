> **Update:** everything in this file is now built. Part 1's three gaps
> (service link, response timer, tools-needed field) shipped first; the
> full 12-step chain from the second image — public intake form, internal
> alert email, deal↔project linking, Client-Approved yes/no branching, and
> the new Invoices + Payments module — shipped after. See the walkthrough at
> the end of this file for what each piece actually is.

# Inquiry Urgent Needs — What's Done, What's Not

Simple check of your list against the real CRM, plus a look at whether the
second image (the generic Lead→Sales flow) actually fits a **software
company**. No guessing — everything below is checked against the real code.

---

## Part 1 — Your urgent list, one by one

| # | What you asked for | Status | Simple explanation |
|---|---|---|---|
| 1 | List of inquiries | ✅ Done | Inquiries page already shows every inquiry, as a board or a list. |
| 2 | Which services are inquired | ❌ Not done | There's a separate "Products & Services" page (your service catalog), but an Inquiry doesn't link to it. Right now you can only type a free-text "Industry" — not pick "Custom Software Development" from your actual service list. |
| 3 | How to respond to any inquiry | ✅ Done | Every inquiry has a Status Pipeline (New → In Review → Responded → Proposal Sent → Deal Done), a Notes field, and — since our last session — a real "Send confirmation email" button and an automatic Thank-You email the moment it's created. |
| 4 | How big is each inquiry / when will it mature | ⚠️ Partial | "How big" = Estimated Budget field (exists). "When will it mature" = Expected Close Date field (exists). |
| 5 | What tools are needed to mature this inquiry | ❌ Not done | No field for this at all. Closest thing is the new "Feasibility Study Notes" field we just added, but it's freeform text, not a checklist of tools/resources. |
| 6 | Who is assigned this inquiry | ✅ Done | "Assigned To" field on every inquiry. |
| 7 | When did it come in, and a timer until first response | ⚠️ Partial | "Date Received" exists. But there's **no visible timer or clock** anywhere showing "this inquiry has been sitting for 2 days with no response" — that's a real gap. The auto Thank-You email *is* timestamped in the inquiry's history, so the data to build this exists, it's just not shown as a timer/alert yet. |
| 8 | Types of inquiries | ⚠️ Partial | There's a "Source" field (Web Form, Referral, Cold Call, etc.) — that's *where it came from*, not *what kind of work it is*. If you mean "type of service requested," see #2 above — same gap. |
| 9 | Buttons to send quotations | ✅ Done (just built) | Every inquiry now has a "Create proposal" button that opens the quote builder pre-linked to that inquiry, and the quote shows up right there on the inquiry page once made. |

### The real, honest gaps (in priority order)

1. **Link an inquiry to an actual Service** from your Products & Services
   catalog, instead of free-text "Industry." Cheap fix, high value —
   directly answers "which services are inquired."
2. **A visible response-time timer/alert** — e.g. a red badge on any
   inquiry sitting untouched for more than X hours since it came in. The
   timestamp data already exists (received_date + the auto-email's
   timestamp); this is about *showing* it clearly, not collecting new data.
3. **A "tools/resources needed" field** — simple to add once you tell me
   what shape you want it in (a text field is easy; a checklist of
   specific tools is a bit more work).

---

## Part 2 — Is the second image's flow correct for YOUR ERP?

Short answer: **partly — two of the eight boxes don't belong in a software
company's ERP, and I want to flag that clearly since you asked me to.**

| Box in the image | Fits a software company? | What it actually is here |
|---|---|---|
| Lead | ✅ Yes | This is your Inquiry. |
| Opportunity | ✅ Yes | This is your Opportunities/Deals module. |
| Quotation | ✅ Yes | This is your Estimations/Quotes module (just linked to Inquiries). |
| Customer | ✅ Yes | This is your Accounts module. |
| Sales Order | ⚠️ Doesn't quite fit | A "Sales Order" is for a customer ordering physical goods to be shipped. Your ERP doesn't have this — and it shouldn't, because a software company doesn't "order" software the way someone orders a product. What plays this role in your business is a **Project** (once a deal is won, work becomes a Project) or an **Agreement/Contract**. |
| Delivery Note | ❌ Does not fit at all | This is a warehouse/logistics document proving physical goods were shipped and received. Software has nothing to "deliver" in a truck. **I'd leave this out entirely** — it's built for a retail/inventory ERP, not yours. |
| Sales Invoice | ⚠️ Doesn't exist yet | This is a real gap (I flagged it in the earlier audit too) — you have no invoice records at all right now, just a manually-typed Revenue number. This part of the image *is* relevant, you just don't have it built yet. |
| Payment | ⚠️ Doesn't exist yet | Same as above — no structured record of "this invoice was paid on this date." |

**My honest read:** the image is a generic ERP template (looks like it's
from a retail/trading-style system, e.g. Frappe/ERPNext's default flow).
For your software company, the correct version of that bottom row is:

```
Won Deal → Project → Invoice → Payment
```

...not `Sales Order → Delivery Note → Sales Invoice → Payment`. Two of
those four boxes (Sales Order, Delivery Note) are extra and not relevant to
you — I'm telling you this now per your instruction, rather than quietly
building things that don't fit your business.

**Can we do this work?** Yes — Project already exists and works well.
Invoice and Payment are the two genuinely missing pieces (same finding as
the earlier document-types audit). Tell me if you want those built next.

---

## Part 3 — What actually changed in the CRM, tab by tab

Plain summary of the real changes made in the last working session:

- **Inquiries tab**: new "Requirements & Analysis" section (Scope,
  Requirements, Business Analysis, Feasibility notes), a "Client Approval"
  checkbox with date + approved-by fields, a "Related Records" area
  showing linked Meetings and linked Proposals right on the inquiry, a
  "Send confirmation email" button, and an automatic Thank-You email that
  fires the moment any inquiry is created.
- **Meetings tab**: every meeting can now optionally link back to the
  Inquiry it came from.
- **Estimations tab**: every quote/proposal can now optionally link back
  to the Inquiry it's for.
- **Company Profile tab**: was actually broken before (blank name, blank
  contact info due to a data bug) — now shows your real company name,
  tagline, and contact email correctly.
- **Reports tab**: every Daily/Weekly/Monthly report now has a "Follow-ups
  Due" section pulling from real inquiry data, plus a "Hours by Project"
  section, plus a generated-on timestamp.
- **Settings tab (new)**: account management for Super Admin / Admin /
  Developer roles — who can see what, and who can create new logins.
- **Dashboard tab**: now shows different content depending on who's
  logged in — a Developer sees only their own project(s) and tasks, not
  company-wide sales/finance data.

Nothing above is undone or half-finished — all of it was tested live
against the real database before being called done.

---

## Part 4 — The 12-step workflow, box by box (final status)

| # | Box | How it works now |
|---|---|---|
| 1 | Website inquiry | A real public, no-login page at `/inquire` — brand-matched to your Company Profile, with your live service catalog in the dropdown. Submits straight into the CRM. Rate-limited (8 submissions / 15 min / IP) so it can't be spammed. |
| 2 | Auto capture → CRM, status New | Unchanged — every inquiry lands with `status: "New"` immediately. |
| 3 | Instant thank-you email | Unchanged — fires the moment any inquiry is created, from either the public form or Admin's own "New Inquiry" page. |
| 4 | Internal alert | New — the moment an inquiry lands, an email goes to your team (`INTERNAL_ALERT_EMAIL` if you set one, otherwise your Company Profile contact email) with the client's details and a nudge to respond. Logged on the inquiry itself so you can see it fired. |
| 5 | Admin review | Unchanged — Requirements, Business Analysis, Feasibility, Budget/Timeline, Assigned To. |
| 6 | Meeting / analysis | Unchanged, but a real bug from last session got fixed while wiring this up: the "Schedule meeting" quick-button on an inquiry wasn't actually saving the link back to the inquiry (the field existed in the data but wasn't in the form's field list, so it silently got dropped on save). Fixed — that link is real now. |
| 7 | Proposal / quote | Unchanged — quotes still link to their inquiry. |
| 8 | Client approved? | New branching. On an approved inquiry, a **"Convert to Deal"** button appears — turns it into a Sales deal in one click, carrying the inquiry link with it. On an unapproved one, a **"Mark as needing revision"** button sets status back to "In Review" and auto-schedules a follow-up 2 days out. Both are now real actions, not just a checkbox that did nothing. |
| 9 | Convert to Deal | Deals now carry an explicit `inquiry_id` back to where they came from. |
| 10 | Project created | The existing "Create project" button (on a Won deal) now stamps the project with `deal_id` and `inquiry_id`, so the link is a real ID match — not a same-client-name guess that could mismatch with two deals for the same client. |
| 11 | Invoice generated | New **Invoices** page (Finance group in the sidebar) — raise an invoice against a project, amount, due date, status. |
| 12 | Payment recorded | Same page, Payments tab — record a payment against an invoice; the invoice row shows paid-vs-outstanding live. |

As flagged in Part 2 above, "Sales Order" and "Delivery Note" were left out
on purpose — they're retail/logistics concepts that don't apply to a
software company, and building them would've been shipping something you'd
never use.
