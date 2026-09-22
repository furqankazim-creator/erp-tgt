# Why emails land in Spam, and what's actually fixable from code

## What I just fixed in `server/mail.mjs`

Three real, independent spam-score factors every automated email from this
CRM had:

1. **No display name on the sender** — every email went out as a bare
   `furqankazim6@gmail.com`, not `"Global Tech" <furqankazim6@gmail.com>`.
   A raw address with no name is one of the more common automated-spam
   signals. Fixed.
2. **No Reply-To** — if a client hit "Reply," it would still work (Gmail
   defaults Reply-To to From), but an explicit Reply-To is a small extra
   trust signal spam filters look at. Fixed.
3. **HTML-only, no plain-text part** — every email was 100% HTML with zero
   `text/plain` version. Filters weight the *absence* of a text part as a
   bulk/marketing signal. Now every email auto-generates a plain-text
   version from its HTML if the caller doesn't supply one. Fixed.

These apply automatically to every email this backend sends — inquiry
emails, Daily/Weekly/Monthly reports, budget alerts, everything — since they
all go through the same `sendMail()`.

## What these fixes can and can't do

They will help, but **they will not fully solve it on their own.** Be
honest with yourself about the ceiling here: the single biggest factor in
whether an email reaches the inbox is **sender domain authentication**
(SPF, DKIM, DMARC) — and right now this CRM sends through a **personal
Gmail account** (`furqankazim6@gmail.com`), not a real business domain.

That matters because:

- Gmail's own servers *do* authenticate mail sent from a real `@gmail.com`
  account correctly (SPF/DKIM pass for gmail.com itself) — so it's not
  "broken," but recipients' spam filters see a **personal, free email
  address sending templated/automated business email at some volume**,
  which is exactly the pattern spam filters are built to catch, regardless
  of how well-formatted the message is.
- The company-branded content ("Global Tech", `hello@globaltech.io` shown
  in the email body) **doesn't match the actual sending address**
  (`furqankazim6@gmail.com`). That mismatch — a business name in the body,
  a personal address in the envelope — is itself a pattern spam filters
  specifically look for (it's the same shape as phishing/impersonation
  email), even though in this case it's completely legitimate.
- A brand-new or low-volume sending address has **no sending reputation**
  yet. The first several emails to any given provider (Gmail, Outlook,
  Yahoo) are more likely to get filtered until that reputation builds up
  from real engagement (opens, replies, "not spam" clicks).

## What actually fixes it properly (needs your decision, not code)

Pick one — in order of how good the result is:

1. **Best: a real business domain with a transactional email service**
   (Resend, Postmark, SendGrid, Amazon SES, or Google Workspace for
   `globaltech.io` if that's a domain you actually own). You configure SPF,
   DKIM, and DMARC DNS records once for that domain, and every email sent
   through it is fully authenticated as genuinely from Global Tech — this
   is what fixes deliverability at the root, not just the content.
2. **Good: Google Workspace** on your real domain (e.g.
   `hello@globaltech.io` as an actual paid Workspace mailbox). Google
   handles SPF/DKIM for you automatically once the domain is verified.
   Then `SMTP_USER`/`SMTP_FROM` in `server/.env` point at that address
   instead of a personal Gmail account.
3. **What you have now (personal Gmail SMTP relay)**: works, and the fixes
   above genuinely help, but it will always have a lower ceiling on inbox
   placement than options 1–2 — this is a Gmail policy reality, not
   something any code change gets around.

## Immediate, no-cost thing you can do right now

The very first few emails to a given recipient are the hardest — once you
(or the recipient) mark one as **"Not spam"** in Gmail/Outlook, that
sender gets whitelisted for that inbox going forward. If you're testing
with your own email, check Spam once, mark it "Not spam," and future test
sends should land in the inbox normally.
