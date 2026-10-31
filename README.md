# Brightloop — Subscription Management System

Django REST Framework backend + React (Vite) frontend for plans, subscriptions, recurring billing, payments and revenue reporting.

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Emails (password reset, new account links) are printed in the `runserver` terminal.

### Scheduled jobs (Celery + Redis)

| Job | When | What it does |
|---|---|---|
| `close_expired_subscriptions` | 00:30 daily | Closes subscriptions past expiry on plans set to auto-close; expires old quotations |
| `generate_due_invoices` | 01:00 daily | Creates draft invoices for every due period, catching up missed ones |
| `send_overdue_reminders` | 09:00 daily | Emails customers about overdue invoices, at most once a week each |

Start Redis (Docker shown; Memurai or WSL also work), then a worker and the scheduler in two terminals:

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

Without Redis, run the same jobs once by hand. `--date` simulates a future billing day:

```bash
python manage.py run_daily_jobs --date 2026-12-01
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | insecure dev-only key | Set a long random value outside local development |
| `DJANGO_DEBUG` | `true` | Set to `false` outside local development |
| `DJANGO_ALLOWED_HOSTS` | empty (localhost only while debugging) | Comma-separated host names |
| `VITE_API_URL` | `http://127.0.0.1:8000/api` | API base URL used by the React app (an IP, because on Windows `localhost` tries IPv6 first and adds ~2 s per request against `runserver`) |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Where Celery sends jobs |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/0` | Where Celery stores job results |

## Demo accounts (local development only)

| Role  | Email                  | Password        |
|-------|------------------------|-----------------|
| Admin | admin@brightloop.local | Brightloop#Admin1 |
| Staff | ravi@brightloop.local  | Harbour#Lamp42  |
| Customer | asha@smallshop.test | Shopper#2026x |

Staff and customer accounts above exist only in the local `db.sqlite3` created during development.

Create it with:

```bash
set DJANGO_SUPERUSER_PASSWORD=Brightloop#Admin1
python manage.py createsuperuser --noinput --email admin@brightloop.local
```

## Tests

```bash
cd backend
python manage.py test
```
