# Accounts & Finance — How to Actually Use It

A practical, click-by-click runbook. Every button name below is the exact
label in the app — no guessing. Pair this with
`accounts-bookkeeping-guide.md` if you want to understand *why* something
is calculated the way it is; this file is only about *what to click*.

## Contents

1. [One-time setup: your Chart of Accounts](#1-one-time-setup-your-chart-of-accounts)
2. [Daily task: recording a transaction](#2-daily-task-recording-a-transaction)
3. [Monthly task: checking your Profit & Loss](#3-monthly-task-checking-your-profit--loss)
4. [When you invoice a client (Receivables)](#4-when-you-invoice-a-client-receivables)
5. [When you owe someone money (Payables)](#5-when-you-owe-someone-money-payables)
6. [Checking your real cost per hour (Costing)](#6-checking-your-real-cost-per-hour-costing)
7. [Pricing a project estimate](#7-pricing-a-project-estimate)
8. [A full worked example, start to finish](#8-a-full-worked-example-start-to-finish)

---

## 1. One-time setup: your Chart of Accounts

You don't have to do this — 17 starter accounts already exist (Cash,
Accounts Receivable, Accounts Payable, Sales Revenue, Rent Expense, and so
on) — but here's how to add your own.

1. Sidebar → **Finance → Bookkeeping**
2. You land on the **Chart of Accounts** tab — 5 columns: Capital,
   Liabilities, Assets, Revenue, Expenses
3. In whichever column fits, click **"Add"**
4. Fill in:
   - **Account number** — e.g. `1030` (pick a number in that category's
     range: 1000s Assets, 2000s Liabilities, 3000s Capital, 4000s Revenue,
     5000s Expenses)
   - **Account name** — e.g. "Petty Cash"
   - **Parent account** — leave blank for a top-level account, or pick an
     existing one to make this a sub-account (it'll show indented
     underneath it)
   - **Opening balance** — optional, if this account already has money in
     it before you start tracking
5. Click **Save**

To edit or archive one later, click **"Edit"** next to any account in the
list.

---

## 2. Daily task: recording a transaction

This is the one you'll use constantly — every expense, purchase, or money
movement gets logged here.

1. Sidebar → **Finance → Bookkeeping**
2. Click the **"Daily Bookkeeping"** tab
3. Click **"Record transaction"**
4. Fill in:
   - **Account** — pick from your Chart of Accounts (e.g. "5100 Rent
     Expense" if you're paying rent)
   - **Date**, **Amount**, **Description** — required
   - **Parent transaction** — only if this is a split of a bigger one
     already recorded
   - The optional extras only matter for certain categories:
     **Investor name** (if this is a Capital entry), **Debtor** (a
     Liabilities entry), **Asset type** (an Assets entry), **Location**,
     and **Photo / reference note** (a text note, not an actual photo
     upload — type a reference like "receipt filed in folder 3")
5. Click **Save**

It gets a real reference number automatically (`TXN-2026-00001`, and so
on). Use the category filter chips at the top (All / Capital /
Liabilities / Assets / Revenue / Expenses) to find things later.

---

## 3. Monthly task: checking your Profit & Loss

1. Sidebar → **Finance → Bookkeeping**
2. Click the **"Profit & Loss"** tab
3. Use the month picker at the top-right to choose the month you want
4. You'll see three numbers: **Revenue**, **Expenses**, and **Net
   profit** (or **Net loss** if expenses won this round), plus a
   breakdown underneath of exactly which accounts made up each side

This only reflects what's actually been recorded in step 2 above — if you
haven't logged an expense, it won't show up here. There's no need to
"close" or "generate" anything; it's live.

---

## 4. When you invoice a client (Receivables)

1. Sidebar → **Finance → Invoices**
2. Click **"New invoice"**
3. Fill in the invoice number, client, linked project (optional), amount,
   status, and dates → **Save**
4. When the client pays — even partially — find the invoice in the list
   and click **"Record payment"**. It's pre-filled with however much is
   still owed; adjust the amount if it's a partial payment
5. The invoice's "Paid" column updates automatically, and once fully paid
   the "Record payment" button disappears for it

Check the **"Payments"** tab any time to see every payment ever recorded,
across every invoice.

---

## 5. When you owe someone money (Payables)

Same shape as Invoices, just the other direction.

1. Sidebar → **Finance → Payables**
2. Click **"New bill"**
3. Pick a **Type** — Loan, Salary Dues, Vendor Bill, or Other
4. Fill in the payee (for Salary Dues, you can also link a real employee
   from the dropdown), amount, status, dates → **Save**
5. When you actually pay it — even partially — click **"Record payment"**
   on that bill, same as Invoices

Check the **"Payments Made"** tab to see everything you've paid out.

---

## 6. Checking your real cost per hour (Costing)

You won't do this often — it's mostly a "set it up, glance at it
occasionally" page, not a daily task.

1. Sidebar → **Finance → Costing**
2. The top row already shows your live numbers: Monthly fixed costs,
   Monthly payroll, Total monthly cost, Productive hours, and **Cost per
   hour** — this last one is the important one, it's your real pricing
   floor
3. To add a recurring cost (rent, a software subscription), click **"Add
   fixed cost"**
4. To set a monthly budget ceiling per category, use **"Add budget"** and
   watch the progress bars for anything running over
5. Click **"Record [Month]"** near the chart any time you want to save
   today's rate as a permanent snapshot, so you can see the trend over time

---

## 7. Pricing a project estimate

Two ways, depending on how much detail you need — see the Inquiry guide
for the full context, but here's the short version:

**Quick number:** on an Inquiry, Related Records → Quotes/Estimates →
**"Create proposal"** → fill in hours, rate, margin → **Save quote**. Done
in one step.

**Full breakdown:** open that quote and click **"Detailed estimate"** →
fill in Initial Scope, Tech Stack, a Deliverables list with hours per
item, pick a Cost Slab (Simple/Medium/Complex), set a Margin %, add
Milestones → **Save estimation**. The price at the top updates live as you
add deliverables.

---

## 8. A full worked example, start to finish

Say you just paid your office rent for the month, and separately, a
client just paid an outstanding invoice.

**Recording the rent payment:**
1. Bookkeeping → Daily Bookkeeping → Record transaction
2. Account: `5100 Rent Expense` · Amount: `1200` · Description: "August
   office rent" → Save

**Recording the client's payment:**
1. Invoices → find their invoice → Record payment → confirm the amount →
   Save

**Checking the result:**
1. Bookkeeping → Profit & Loss → this month → you'll see the $1,200 show
   up under Expenses (because you logged it in step 1)
2. The client's payment does **not** show up here — Invoices and
   Bookkeeping are separate systems today (see
   `accounts-bookkeeping-guide.md`, section 12, for why and what it'd take
   to connect them)
