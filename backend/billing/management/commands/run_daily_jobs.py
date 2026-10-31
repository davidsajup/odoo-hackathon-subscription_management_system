from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from billing import services as billing_services
from subscriptions import services as subscription_services


class Command(BaseCommand):
    help = 'Runs the nightly jobs (close expired subscriptions, billing, overdue reminders) without Celery.'

    def add_arguments(self, parser):
        parser.add_argument('--date', help='Run as if today were this date (YYYY-MM-DD).')

    def handle(self, *args, **options):
        try:
            today = date.fromisoformat(options['date']) if options['date'] else timezone.localdate()
        except ValueError:
            raise CommandError('Use the format YYYY-MM-DD for --date.')

        closed = subscription_services.close_expired(today)
        billing = billing_services.generate_due_invoices(today)
        reminders = billing_services.send_overdue_reminders(today)

        self.stdout.write(f'Daily jobs for {today:%d %b %Y}')
        self.stdout.write(f'  Closed subscriptions: {closed["closed_subscriptions"]}')
        self.stdout.write(f'  Expired quotations:   {closed["expired_quotations"]}')
        self.stdout.write(f'  Invoices created:     {billing["created"]}')
        if billing['failed']:
            self.stdout.write(self.style.WARNING(f'  Failed subscriptions: {billing["failed"]}'))
        self.stdout.write(f'  Reminders sent:       {reminders["reminders_sent"]}')
