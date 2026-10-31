from celery import shared_task

from . import services


@shared_task
def generate_due_invoices():
    return services.generate_due_invoices()


@shared_task
def send_overdue_reminders():
    return services.send_overdue_reminders()
