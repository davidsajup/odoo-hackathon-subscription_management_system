# Brightloop — Subscription Management System

One platform for a subscription business: products and plans, quotations, subscriptions, automatic recurring invoices with taxes and discounts, payments, and a finance dashboard. Built for the Odoo hackathon brief *"Build one system to run plans, subscriptions and recurring billing in one place."*

**Stack:** Django 5.2 + Django REST Framework · React 19 (Vite) · SQLite · Celery + Celery Beat with Redis

---

## Features, mapped to the brief

| Scene in the brief | What the system does |
|---|---|
| **A new customer signs up** | Email login (one account per email, case-insensitive). Passwords need more than 8 characters with upper case, lower case and a special character, with a live checklist. Reset links are emailed and work once. Three roles: **admin** (everything), **internal staff** (day-to-day work, read-only catalog), **customer** (own portal only). Only the admin can add staff; new staff and customers set their own password from an emailed link. |
| **Launching a new plan** | Products with type, sales price, cost price, notes and taxes. **Variants** from attributes, e.g. Brand → *Odoo* adds ₹560 to the price. Plans with price, billing period (daily, weekly, monthly, yearly, or every N periods), minimum quantity and availability dates. The admin decides per plan whether it closes automatically at expiry and whether it can be closed early, paused or renewed. |
| **Turning a quote into a subscription** | **Quotation templates** with a plan, product lines and a validity in days. Subscriptions get a number, customer, plan, start/expiry dates, payment terms, and lines with quantity, unit price, taxes and amounts. Lifecycle **Draft → Quotation → Confirmed → Active → Closed**, plus Pause/Resume/Renew, enforced by a state machine with a full history of who did what. Customers accept or decline quotations in the portal. |
| **Billing day** | Draft invoices are generated from subscriptions, with customer details, lines, taxes and totals filled in. **Never billed twice** (database constraint, row locks, a moving next-invoice date) and **never skipped** (missed periods are caught up). Confirm, cancel, send by email, print / save as PDF. Invoices go **Draft → Confirmed → Paid**. |
| **A customer asks for a better price** | Admin-only discount rules: fixed or percentage, minimum purchase or quantity, start and end dates, usage limit, for specific products or whole subscriptions. **Applied automatically** to the next invoice (the best one wins) and stop when they expire or run out. |
| **The money comes in** | Record payments by method, amount, date and note. Part payments are allowed; invoices become Paid automatically. Paid, outstanding and **overdue** invoices are visible at any time, and overdue customers get a weekly reminder email. |
| **The finance lead, end of month** | A dashboard with active subscriptions, MRR, invoiced, collected, outstanding and overdue, filterable by period and plan, plus a 12-month invoiced-vs-collected chart, revenue by plan, subscriptions by status and an overdue list. **Every API call ≤ 56 ms with 3,000 subscriptions and 17,700 invoices.** |
| **"Renewals remembered by whoever notices first"** | Celery Beat runs nightly jobs: close expired subscriptions, generate due invoices, send overdue reminders. |

---

## Quick start

Requirements: **Python 3.11+**, **Node 20+**. Redis is optional (only for the scheduled jobs).

**1. Backend** (terminal 1)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```
On macOS/Linux, activate with `source .venv/bin/activate`.

`seed_demo` creates the demo logins below plus 600 demo customers, 3,000 subscriptions and about 8 months of invoices and payments, in about 15 seconds. Skip it for an empty system.

**2. Frontend** (terminal 2)
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. All emails (password resets, new-account links, invoices, reminders) are **printed in the backend terminal**.

### Demo logins (local development only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@brightloop.local` | `Brightloop#Admin1` |
| Internal staff | `ravi@brightloop.local` | `Harbour#Lamp42` |
| Customer | `asha@smallshop.test` | `Shopper#2026x` |

`seed_demo` creates these if they don't exist. The 600 `demo-customer-…@example.test` accounts have no password; they exist only for volume.

---

## 5-minute demo script

1. **Admin → Catalog → Products → Brightloop CRM.** The *Brand: Odoo* variant costs ₹1,560 (₹1,000 + ₹560).
2. **Catalog → Plans → Add plan.** Price, billing period, minimum quantity, availability dates and the four rule checkboxes (auto-close, close early, pause, renew).
3. **Sales → Quotation templates → Add template**, then **Subscriptions → From template.** Pick a customer and get a draft quotation with every line priced and taxed.
4. **Send quotation.** In another browser, log in as the customer and **Accept quotation** in the portal. Back as staff, **Activate**. The History panel shows every step and who did it.
5. **Create invoice.** It's a draft with lines, GST and any discount that applies. **Confirm → Send by email** (shown in the backend terminal) **→ Print.**
6. **Register payment** for part of the amount, then the rest. The invoice becomes **Paid**.
7. **Dashboard.** Switch the period and plan filters and hover the chart; the overdue list shows invoices to chase.
8. **Billing day without waiting a month:**
   ```bash
   python manage.py run_daily_jobs --date 2026-12-01
   ```
   The terminal prints how many invoices were created, subscriptions auto-closed and reminders sent.

---

## Scheduled jobs (Celery + Redis)

| Job | When (Asia/Kolkata) | What it does |
|---|---|---|
| `close_expired_subscriptions` | 00:30 daily | Closes subscriptions past expiry whose plan auto-closes; closes expired quotations |
| `generate_due_invoices` | 01:00 daily | One draft invoice per due period, catching up missed periods; safe to run twice |
| `send_overdue_reminders` | 09:00 daily | Emails customers about overdue invoices, at most once a week each |

Start Redis (Docker shown; Memurai or WSL also work), then a worker and the scheduler, each in its own terminal with the virtual environment activated:

```bash
docker run -d --name brightloop-redis -p 6379:6379 redis:7-alpine
```

```bash
cd backend
celery -A config worker --pool=solo -l info
```

```bash
cd backend
celery -A config beat -l info
```

`--pool=solo` is needed on Windows. Without Redis, `python manage.py run_daily_jobs [--date YYYY-MM-DD]` runs the same three jobs once.

---

## Tests

```bash
cd backend
python manage.py test
```

**88 tests** cover the brief's rules end to end. They include:
- password rules and single-use reset links
- role permissions, and customers never seeing other customers' data
- the variant price (+560) and tax maths
- the subscription state machine and plan rules
- billing idempotency and catch-up, month-end billing dates
- discount conditions, usage limits and best-discount selection
- part payments and overdue detection
- auto-close and reminders, and the Celery schedule
- dashboard numbers and MRR

Frontend checks:
```bash
cd frontend
npm run lint
npm run build
```

---

## Project structure

```
backend/
  config/          settings, URLs, Celery app, pagination
  accounts/        custom User (email login, role), auth endpoints, permissions, password rule
  catalog/         taxes, products, attributes and variants, plans, discounts
  subscriptions/   quotation templates, subscriptions, lines, history, state machine (services.py), tasks
  billing/         invoices, payments, billing engine (services.py), tasks, run_daily_jobs command
  reports/         dashboard and portal summaries, seed_demo command
frontend/src/
  api/             axios client (token header, logout on 401), error parsing
  auth/            auth context, route guards, password rules
  components/      reusable list page, form modal, picker, chart, UI pieces
  pages/           auth, back office (catalog, subscriptions, billing, dashboard), customer portal
```

Business rules live in `services.py` files, which the API views, Celery tasks, management commands and tests all call.

## API overview

All endpoints are under `/api/` and use `Authorization: Token <key>` from `/api/auth/login/`.

| Area | Endpoints |
|---|---|
| Auth | `auth/signup/`, `auth/login/`, `auth/logout/`, `auth/me/`, `auth/password-reset/`, `auth/password-reset/confirm/` |
| Users | `users/staff/` (admin), `users/customers/` (staff) |
| Catalog | `catalog/taxes/`, `catalog/products/`, `catalog/attributes/`, `catalog/variants/`, `catalog/plans/`, `catalog/discounts/` |
| Sales | `quotation-templates/`, `subscriptions/`, `subscriptions/{id}/actions/{send_quotation\|confirm\|activate\|pause\|resume\|renew\|close}/`, `subscriptions/from-template/`, `subscriptions/{id}/invoice/` |
| Billing | `invoices/` (filters: `state`, `overdue`, `date_from`, `date_to`), `invoices/{id}/actions/{confirm\|cancel\|send}/`, `invoices/bulk-confirm/`, `payments/`, `billing/run/` |
| Reports | `reports/summary/`, `reports/revenue-trend/`, `reports/my-summary/` |

Lists are paginated (25 per page, `?page_size=` up to 500) and support `?search=` and `?ordering=`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | insecure dev-only key | Set a long random value outside local development |
| `DJANGO_DEBUG` | `true` | Set to `false` outside local development |
| `DJANGO_ALLOWED_HOSTS` | empty (localhost only while debugging) | Comma-separated host names |
| `VITE_API_URL` | `http://127.0.0.1:8000/api` | API base URL for the React app. It's an IP because on Windows `localhost` tries IPv6 first and adds ~2 s per request against `runserver` |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Where Celery sends jobs |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/0` | Where Celery stores job results |

## Design notes

- **Money** uses `Decimal`, never floats, and rounds half up to the paisa.
- **Invoices keep a copy** of customer details, prices and taxes, so later catalog changes never rewrite history.
- **SQLite** runs in WAL mode with `IMMEDIATE` transactions so billing and normal use can write at the same time. Switching to PostgreSQL is a settings change.
- **Overdue** is computed (confirmed + past the due date), not stored, so it's always correct.
- **No extra libraries** beyond the stack: the chart is plain SVG, and printing uses the browser's print / save-as-PDF.
