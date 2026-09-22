# The Accounts & Finance System — Complete Guide

How money is tracked in this CRM end to end — the Chart of Accounts, daily
bookkeeping, Profit & Loss, what clients owe you, what you owe others, and
how project pricing is calculated. Written the same way as the Inquiry
guide: every claim below is either something you can click through in the
app, or something verified live against the real database this build.

## Contents

1. [Overview — the whole Finance map](#1-overview)
2. [Chart of Accounts](#2-chart-of-accounts)
3. [Daily Bookkeeping](#3-daily-bookkeeping)
4. [Profit & Loss](#4-profit--loss)
5. [Receivables — Invoices](#5-receivables--invoices)
6. [Payables — Bills](#6-payables--bills)
7. [Costing — your cost per hour](#7-costing--your-cost-per-hour)
8. [Project Estimates — the bid price formula](#8-project-estimates--the-bid-price-formula)
9. [How the pieces connect](#9-how-the-pieces-connect)
10. [Roles & Permissions](#10-roles--permissions)
11. [Technical Reference](#11-technical-reference)
12. [What's Not Connected Yet](#12-whats-not-connected-yet)

---

## 1. Overview

There are **five separate pages** under the Finance section of the sidebar,
and they do five genuinely different jobs — this matters, because none of
them duplicate each other:

```
Bookkeeping  → the general ledger: Chart of Accounts, daily transactions, P&L
Invoices     → Receivables — money clients owe you
Payables     → money you owe (loans, salary dues, vendor bills)
Costing      → your real cost per hour, for pricing work
Revenue      → recognized revenue pulled from Deals/Projects/Accounts
```

Costing and Revenue already existed before this build; Bookkeeping and
Payables are new. They're deliberately kept separate rather than merged
into one mega-page — a bookkeeper working the ledger and a salesperson
checking pricing are doing two different jobs.

---

## 2. Chart of Accounts

`Bookkeeping → Chart of Accounts` tab. Five columns, exactly matching the
reference chart you provided: **Capital, Liabilities, Assets, Revenue,
Expenses**.

Every account has a **number** (the standard convention: 1000s = Assets,
2000s = Liabilities, 3000s = Capital, 4000s = Revenue, 5000s = Expenses —
seeded with 17 starter accounts like `1010 Cash — Checking Account` and
`5100 Rent Expense`, editable and extendable), a **name**, and can
optionally have a **parent account** — pick one when adding, and it
renders indented underneath it as a sub-account. Each column also shows
whether it belongs to the **Balance Sheet** (Capital/Liabilities/Assets) or
the **Income Statement** (Revenue/Expenses) — this is calculated from the
category every time, never stored separately, so it can never drift out of
sync if you rename or recategorize something.

**Click "Add"** on any column to create a top-level account or, by picking
a parent, a sub-account.

---

## 3. Daily Bookkeeping

`Bookkeeping → Daily Bookkeeping` tab. This is where actual day-to-day
money movements get recorded — an expense, a purchase, a capital
injection, anything that happened.

**"Record transaction"** asks for:
- **Account** — which Chart of Accounts entry this posts against (required)
- **Date**, **Amount**, **Description** (required)
- **Parent transaction** (optional) — link it to another transaction, for
  a split or a child entry
- Category-specific extras, all optional: **Investor name** (for Capital
  entries), **Debtor** (Liabilities), **Asset type** (Assets), **Location**,
  and a **Photo / reference note** — a text field for a reference to a
  receipt or photo, not a file upload (the generic form system this page
  is built on doesn't support image uploads yet — noted honestly, not
  faked)

The list is filterable by category (All / Capital / Liabilities / Assets /
Revenue / Expenses), and every transaction gets a real sequential ID —
`TXN-2026-00001`, and so on.

---

## 4. Profit & Loss

`Bookkeeping → Profit & Loss` tab. Pick a month, and it shows:

**Revenue (sum of all transactions posted to Revenue accounts that
month) − Expenses (same, for Expense accounts) = Net Profit or Net Loss**,
plus a breakdown by individual account underneath (e.g. how much of this
month's revenue was "Sales Revenue" vs "Service Revenue").

This is calculated purely from what's actually been recorded in Daily
Bookkeeping — it is **not** the same thing as the Revenue page (which
pulls from Deals/Projects/Accounts) or the Costing page (which prices
future work). Verified live: posted a real $5,000 revenue transaction and
a real $1,200 expense transaction in the same month, and the P&L
correctly showed $3,800 net profit.

---

## 5. Receivables — Invoices

`Invoices` page — this already existed before this build, and nothing
about it changed. Raise an invoice against a client (optionally linked to
a Project), track its status (Draft/Sent/Paid/Overdue/Cancelled), and
record payments against it — the page shows what's been paid and what
remains outstanding per invoice, plus totals across everything (Total
Invoiced, Total Collected, Outstanding, Overdue count).

---

## 6. Payables — Bills

`Payables` page — brand new, built as the deliberate mirror of Invoices.
Where Invoices tracks money owed *to* you, Payables tracks money *you*
owe:

- **Type**: Loan, Salary Dues, Vendor Bill, or Other
- **Payee** — free text (a lender's name, a vendor), with an optional link
  to a real Employee record specifically for Salary Dues entries
- **Amount**, **Status** (Pending/Paid/Overdue/Cancelled), issue/due dates
- **Record payment** against any bill — same partial-payment tracking as
  Invoices (paid so far / remaining), with its own Payments Made tab

Verified live: a $2,000 Salary Dues bill with an $800 payment recorded
correctly showed $1,200 outstanding.

---

## 7. Costing — your cost per hour

`Costing` page — already existed, unchanged. This answers one specific
question: *"what does an hour of our own work actually cost us?"*

**Monthly Fixed Costs** (rent, utilities, software subscriptions — the
`costs` list on this page, each with its own frequency and department)
**+ Monthly Payroll** (pulled live from HR — every active employee's
salary) **= Total Monthly Cost**, divided by **Productive Hours** (active
employees × working days/month × hours/day) **= Cost Per Hour**. This
number is used as the real pricing floor throughout the app — it's what
`useOrgCostPerHour()` returns, and it's what the quick Estimation
calculator defaults its rate to.

There's also a Budget-vs-Actual tracker per cost category, and a recorded
month-by-month trend of the cost-per-hour rate over time.

---

## 8. Project Estimates — the bid price formula

This is spread across two places, both already covered in the Inquiry
guide, but the formula is worth restating plainly since it's exactly what
your reference diagram describes: **Total man hours × cost basis, plus a
margin, equals the final bid.**

- **Fast path** — the quick Quote calculator: hours × rate + margin % =
  suggested price, in one step.
- **Detailed path** — the Estimation page: a real itemized Deliverables
  list (each with its own hours), a Cost Slab (Simple/Medium/Complex, each
  with its own $/hr — the same rates used in the Basic Quotation email),
  and a Margin % — all rolled up into the same suggested price, just with
  a real breakdown behind it instead of one guessed number.

---

## 9. How the pieces connect

- **Bookkeeping and Costing are intentionally separate systems.** Costing
  answers "what should we charge" (a pricing tool); Bookkeeping's P&L
  answers "what did we actually make or spend" (an accounting record).
  They share no data today — see [Section 12](#12-whats-not-connected-yet).
- **Invoices and Payables share no data with Bookkeeping either.** Raising
  an invoice or paying a bill does not currently post a matching entry
  into the Chart of Accounts ledger.
- **Costing's payroll figure and Payables' Salary Dues are also
  separate** — HR salary data feeds Costing's cost-per-hour automatically;
  a Salary Dues bill in Payables has to be entered by hand.

This is the honest state of the system: five real, working, correctly
calculating pages that don't yet talk to each other automatically. Whether
that's the right call depends on how you want to run the books — see the
next section.

---

## 10. Roles & Permissions

All five Finance pages (Bookkeeping, Invoices, Payables, Costing, Revenue)
are restricted to **Super Admin and Admin** — the same access level as the
rest of company financials. Salesmen do not see any of this section,
matching how they're scoped everywhere else in the app (their own
inquiries/deals/accounts only).

---

## 11. Technical Reference

**Tables**
| Table | What it holds |
|---|---|
| `chart_of_accounts` | The COA tree — category, account number, name, parent |
| `bookkeeping_transactions` | Every daily transaction, `TXN-2026-#####` |
| `invoices` / `payments` | Receivables and money collected |
| `bills` / `bill_payments` | Payables and money paid out |
| `costs` / `budgets` / `cost_snapshots` | Recurring fixed costs, budget targets, recorded cost-per-hour history |

**Frontend**
| File | Responsibility |
|---|---|
| `src/routes/_authenticated/bookkeeping.tsx` | Chart of Accounts, Daily Bookkeeping, P&L — all three tabs |
| `src/routes/_authenticated/payables.tsx` | Bills + Payments Made |
| `src/routes/_authenticated/invoices.tsx` | Invoices + Payments (Receivables) |
| `src/routes/_authenticated/costing.tsx` | Fixed costs, payroll, cost-per-hour, budgets |
| `src/routes/_authenticated/revenue.tsx` | Recognized revenue reporting |
| `src/lib/costing.ts` | `useOrgCostPerHour()` — the shared cost-per-hour calculation used across Costing and Estimation |

---

## 12. What's Not Connected Yet

Stated plainly, matching the same honesty standard as the rest of this
project's docs:

- **A bill payment in Payables doesn't post an Expense transaction into
  Bookkeeping.** Paying a Salary Dues bill, for instance, doesn't
  automatically show up in the P&L's Expenses. Right now the two are
  tracked independently.
- **An invoice payment in Receivables doesn't post a Revenue transaction
  into Bookkeeping** either, for the same reason.
- **Costing's payroll and Payables' Salary Dues aren't the same number.**
  Costing pulls live from every active employee's salary in HR
  automatically; Payables only knows about Salary Dues you've explicitly
  entered as bills.
- No opening-balance carry-forward or period-close/lock mechanism exists
  yet — the P&L is always computed live from whatever's currently in the
  ledger for that month.

If you want the ledger to be the single source of truth — so a paid
invoice or bill automatically shows up correctly in the P&L without
re-entering it — that's a real, well-scoped next step, not a small tweak:
wiring the "Record payment" actions on both Invoices and Payables to also
create a matching Bookkeeping transaction. Say the word and I'll build it.
