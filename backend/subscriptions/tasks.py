from celery import shared_task

from . import services


@shared_task
def close_expired_subscriptions():
    return services.close_expired()
