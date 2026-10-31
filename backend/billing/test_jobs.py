from datetime import timedelta
from io import StringIO

from django.conf import settings
from django.core import mail
from django.core.management import call_command
from django.utils import timezone

from config.celery import app
from subscriptions import services as subscription_services
from subscriptions.models import Subscription

from . import services, tasks
from .models import Invoice
from .tests import BillingTestCase


class AutoCloseTests(BillingTestCase):
    def test_closes_expired_subscriptions_only_when_plan_says_so(self):
        start = self.today - timedelta(days=60)
        expired = self.make_subscription(start=start, expiry=self.today - timedelta(days=1))
        paused = self.make_subscription(start=start, expiry=self.today - timedelta(days=1))
        Subscription.objects.filter(pk=paused.pk).update(state=Subscription.State.PAUSED)
        still_running = self.make_subscription(start=start)
        self.plan.auto_close = True
        self.plan.save()

        result = subscription_services.close_expired(self.today)
        self.assertEqual(result['closed_subscriptions'], 2)
        for subscription in (expired, paused):
            subscription.refresh_from_db()
            self.assertEqual(subscription.state, Subscription.State.CLOSED)
            self.assertIsNone(subscription.next_invoice_date)
            event = subscription.events.first()
            self.assertIsNone(event.user)
            self.assertEqual(event.note, 'Closed automatically at expiry')
        still_running.refresh_from_db()
        self.assertEqual(still_running.state, Subscription.State.ACTIVE)

    def test_without_auto_close_expired_subscription_stays_open_but_unbilled(self):
        subscription = self.make_subscription(start=self.today - timedelta(days=60),
                                              expiry=self.today - timedelta(days=1))
        Subscription.objects.filter(pk=subscription.pk).update(next_invoice_date=self.today)
        self.assertEqual(subscription_services.close_expired(self.today)['closed_subscriptions'], 0)
        self.assertEqual(services.generate_due_invoices(self.today)['created'], 0)

    def test_expires_old_quotations(self):
        stale = self.make_subscription(state=Subscription.State.QUOTATION)
        fresh = self.make_subscription(state=Subscription.State.QUOTATION)
        Subscription.objects.filter(pk=stale.pk).update(quotation_valid_until=self.today - timedelta(days=1))
        Subscription.objects.filter(pk=fresh.pk).update(quotation_valid_until=self.today)

        self.assertEqual(subscription_services.close_expired(self.today)['expired_quotations'], 1)
        self.assertEqual(Subscription.objects.get(pk=stale.pk).state, Subscription.State.CLOSED)
        self.assertEqual(Subscription.objects.get(pk=fresh.pk).state, Subscription.State.QUOTATION)


class ReminderTests(BillingTestCase):
    def overdue_invoice(self, days_late=3):
        invoice = services.perform_invoice_action(self.invoice_for(self.make_subscription()), 'confirm')
        Invoice.objects.filter(pk=invoice.pk).update(due_date=self.today - timedelta(days=days_late))
        return invoice

    def test_reminds_once_a_week_until_paid(self):
        invoice = self.overdue_invoice()
        self.assertEqual(services.send_overdue_reminders(self.today)['reminders_sent'], 1)
        self.assertIn('overdue', mail.outbox[0].subject)
        self.assertIn('3 days ago', mail.outbox[0].body)
        self.assertEqual(services.send_overdue_reminders(self.today)['reminders_sent'], 0)

        Invoice.objects.filter(pk=invoice.pk).update(reminder_sent_at=timezone.now() - timedelta(days=8))
        self.assertEqual(services.send_overdue_reminders(self.today)['reminders_sent'], 1)

        Invoice.objects.filter(pk=invoice.pk).update(state=Invoice.State.PAID, reminder_sent_at=None)
        self.assertEqual(services.send_overdue_reminders(self.today)['reminders_sent'], 0)

    def test_not_yet_due_invoices_get_no_reminder(self):
        services.perform_invoice_action(self.invoice_for(self.make_subscription()), 'confirm')
        self.assertEqual(services.send_overdue_reminders(self.today)['reminders_sent'], 0)


class CeleryTaskTests(BillingTestCase):
    def test_tasks_run_the_same_services(self):
        self.make_subscription()
        self.assertEqual(tasks.generate_due_invoices.apply().get()['created'], 1)
        self.assertEqual(tasks.send_overdue_reminders.apply().get(), {'reminders_sent': 0})

    def test_beat_schedule_points_at_registered_tasks(self):
        app.loader.import_default_modules()
        for name, entry in settings.CELERY_BEAT_SCHEDULE.items():
            with self.subTest(job=name):
                self.assertIn(entry['task'], app.tasks)


class DailyJobsCommandTests(BillingTestCase):
    def test_command_simulates_a_future_billing_day(self):
        subscription = self.make_subscription()
        services.generate_invoice(subscription.pk, self.today)
        subscription.refresh_from_db()

        out = StringIO()
        call_command('run_daily_jobs', '--date', subscription.next_invoice_date.isoformat(), stdout=out)
        self.assertIn('Invoices created:     1', out.getvalue())
        self.assertEqual(subscription.invoices.count(), 2)
