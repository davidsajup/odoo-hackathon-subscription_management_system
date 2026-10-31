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

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | insecure dev-only key | Set a long random value outside local development |
| `DJANGO_DEBUG` | `true` | Set to `false` outside local development |
| `DJANGO_ALLOWED_HOSTS` | empty (localhost only while debugging) | Comma-separated host names |
| `VITE_API_URL` | `http://localhost:8000/api` | API base URL used by the React app |

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
