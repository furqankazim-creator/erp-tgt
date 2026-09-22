# Inquiry Automation — Planning

This reviews your draft plan against what's actually in the codebase, answers
as many of your "Technical Questions" as the code already settles, and lays
out a concrete build plan. Nothing here is implemented yet — this is the plan
to approve before I start building.

---

## 0. What your draft got right, and the one assumption I need you to confirm

Your 4-step flow is sound and matches how this CRM is already built:

1. Website inquiry form → instant "Thank You" to the client.
2. That inquiry lands in our system automatically.
3. Admin fills in anything missing.
4. Admin hits Submit → client gets a final email with full details.

**The one thing I can't confirm from the code: your draft calls step 2's
destination the "Chat App."** I searched this whole repo for a chat
application and there isn't one — the only place an inquiry could land is the
**Inquiries module already built in this CRM**
([inquiries.index.tsx](../src/routes/_authenticated/inquiries.index.tsx),
Board + List views, the same one with the activity timeline and
convert-to-deal flow). My assumption for the rest of this plan: **"Chat App"
means this CRM's Inquiries page** — new leads should appear there, not in a
separate product. If you actually mean a different, real chat application
(e.g. a live-chat widget), tell me and the integration target changes
entirely — see §6.

---

## 1. Answers to your "Technical Questions" (§5) from the real code

| Question | Answer |
|---|---|
| Database? | MongoDB Atlas — already connected (`server/db.mjs`), Inquiries already has a full schema (`inquiries` collection). |
| Email service? | Already built and working — `server/mail.mjs`, SMTP via Gmail (nodemailer), configured in `server/.env` (`SMTP_USER` / `SMTP_APP_PASSWORD`). This is the exact same pipeline that sends your Daily/Weekly/Monthly reports — no new service needed. |
| Real-time (webhook) or polling? | Webhook — a lead only happens once per form submit, and the CRM backend is always running. A webhook (the website POSTs directly to a new CRM endpoint) is simpler and faster than polling and fits the existing Express backend pattern. |
| Chat App custom or existing, API available? | Resolved by §0 — it's this CRM's own Inquiries module, so "the API" is just this backend's own database write. No external API to integrate. |
| Website stack? | **Unknown — genuinely need this from you.** See §6. |

---

## 2. The actual data flow

```
 Public website inquiry form
          │  visitor submits (name, email, phone, company, message, service)
          ▼
 NEW public endpoint: POST /api/public/inquiries   (no login required —
          │                                          the public website isn't
          │                                          an authenticated CRM user)
          ├──▶ writes a new row into the `inquiries` collection
          │     status = "New", source = "Web Form"
          │
          ├──▶ sends "Thank You" email to the client        (§3, template A)
          │
          └──▶ sends "New inquiry" notification email        (§4)
                to whichever staff are subscribed
                            │
                            ▼
              Inquiry shows up on /inquiries (Board, "New" column)
              exactly like any inquiry does today
                            │
                            ▼
              Admin opens it, fills in anything the website
              form didn't capture (industry, budget, next follow-up, etc.)
                            │
                            ▼
              Admin clicks "Submit" / changes status to "In Review"
                            │
                            ▼
              CRM sends "Final Confirmation" email to the client  (§3, template B)
              with the full request details
```

This reuses the existing Inquiries schema and Board UI completely — no new
module, no new database table. The only new backend pieces are:
one public POST endpoint, and two new email-sending code paths (mirroring the
pattern already used by `server/jobs.mjs`'s report emails).

---

## 3. The client-facing emails — actual content, using your real Company Profile

Your Company Profile module already has this data
([company-profile.tsx](../src/routes/_authenticated/company-profile.tsx)),
so the templates below pull from it instead of hardcoding anything:

- `display_name`: Global Tech
- `tagline`: Software and data engineering for teams that ship.
- `website`: globaltech.io
- `phone`: +971 4 555 0100
- `email`: hello@globaltech.io
- `description`: (the one-paragraph company description)

### Template A — instant "Thank You" (sent the moment the form is submitted)

```
Subject: Thanks for reaching out to Global Tech, {{client_name}}

Hi {{client_name}},

Thanks for getting in touch with Global Tech — Software and data
engineering for teams that ship.

We've received your message and someone from our team will get back to
you within one business day.

What you sent us:
  Service interested in: {{service}}
  Message: {{message}}

If anything's urgent, you can also reach us directly:
  Phone: +971 4 555 0100
  Email: hello@globaltech.io

Talk soon,
The Global Tech Team
globaltech.io
```

Plain, short, immediate — its only job is to confirm receipt. Matches the
visual style of the existing report emails (dark header banner, Global Tech
branding) so it looks consistent with every other email this CRM sends.

### Template B — final confirmation (sent when Admin clicks Submit)

```
Subject: Following up on your inquiry — Global Tech

Hi {{client_name}},

Thanks for your patience — here's a summary of what we have on file for
your request:

  Company: {{company}}
  Service: {{service_type}}
  Preferred contact method: {{preferred_contact_method}}
  Message: {{description}}

{{owner_name}} from our team will be your point of contact going forward
and will follow up with next steps shortly.

In the meantime, feel free to reach us:
  Phone: +971 4 555 0100
  Email: hello@globaltech.io

Best,
{{owner_name}}
Global Tech
```

This one shows the client their own submitted details back — reassures them
nothing got lost, and gives them a named point of contact
(`inquiry.owner`, a field the Inquiries schema already has).

---

## 4. Internal "new inquiry" notification

Mirrors the existing `report_subscriptions` pattern already used for
Daily/Weekly/Monthly reports and Budget Alerts
([jobs.mjs](../server/jobs.mjs)) — add a new subscription type
(`"NewInquiry"`) so whoever should be pinged on a fresh lead is configurable
from the Reports page's existing "Report Subscriptions" table, not
hardcoded. No new UI needed — the subscriptions table already supports
adding a new type.

---

## 5. Admin flow — what actually needs to change in the Inquiries UI

- The inquiry detail/edit page already has every field the website form
  wouldn't capture (industry, estimated budget, next follow-up, etc.) — no
  new fields needed, they just start blank until Admin fills them.
- Add one thing that doesn't exist yet: a **"Send confirmation email"**
  action on the inquiry detail page (visible once status moves past "New"),
  which fires Template B to `inquiry.email` and logs it in the inquiry's
  existing `activity_log`. This is the "Submit" button from your draft —
  no separate submit flow needed, it plugs into the stage change that
  already exists (`New → In Review`).
- A visual "missing fields" indicator (e.g. a small warning badge on
  fields that came from the website with no value) is a nice-to-have, not
  required for the flow to work — I'd build it after the core pipeline if
  you want it.

---

## 6. Open questions — need your answer before I can build §2's first step

These aren't things I can infer from this repo:

1. **What is the actual public website, and what stack is it built on?**
   (WordPress / Webflow / custom React / something else, and its domain).
   This determines exactly what the "POST to our webhook" step looks like
   on the website's side — a WordPress form needs a plugin/webhook config,
   a custom site needs a fetch() call added to its form handler.
2. **Do you control that website's code/hosting**, or does someone else
   maintain it? (affects how fast the webhook side can actually be wired up)
3. Should Admin be able to **edit the email text before it sends**, or is
   the template above sent as-is every time?
4. **How many people should get the "new inquiry" notification** — one
   admin, or a list? (the subscription mechanism in §4 supports either)
5. Confirming §0: is "Chat App" really this CRM's Inquiries module, or a
   separate real chat product I don't know about?

---

## Next steps

1. You confirm §0 (Chat App = Inquiries module) and answer §6.
2. I build: the public webhook endpoint, both email templates wired to
   real Company Profile data, the internal notification subscription type,
   and the "Send confirmation email" action on the inquiry page.
3. You give me the website's form (or its stack) so the actual webhook call
   gets added on that side — that part lives outside this repo.
