from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db.models import Count, Min, Q, Sum
from django.db.models.functions import TruncMonth

from billing.models import Invoice, Payment
from catalog.models import Plan, round_money
from subscriptions.models import Subscription, SubscriptionEvent

ZERO = Decimal('0')
ISSUED = [Invoice.State.CONFIRMED, Invoice.State.PAID]
MONTHLY_FACTOR = {
    Plan.BillingPeriod.DAILY: Decimal(365) / 12,
    Plan.BillingPeriod.WEEKLY: Decimal(52) / 12,
    Plan.BillingPeriod.MONTHLY: Decimal(1),
    Plan.BillingPeriod.YEARLY: Decimal(1) / 12,
}


def money(value):
    return str(round_money(value or ZERO))


def monthly_recurring_revenue(subscriptions):
    groups = (subscriptions.filter(state=Subscription.State.ACTIVE)
              .values('plan__billing_period', 'plan__billing_interval')
              .annotate(total=Sum('amount_untaxed')))
    return sum((group['total'] * MONTHLY_FACTOR[group['plan__billing_period']] / group['plan__billing_interval']
                for group in groups), ZERO)


def finance_summary(date_from, date_to, today, plan_id=None):
    subscriptions = Subscription.objects.all()
    invoices = Invoice.objects.all()
    payments = Payment.objects.all()
    events = SubscriptionEvent.objects.filter(created_at__date__range=(date_from, date_to))
    if plan_id:
        subscriptions = subscriptions.filter(plan_id=plan_id)
        invoices = invoices.filter(subscription__plan_id=plan_id)
        payments = payments.filter(invoice__subscription__plan_id=plan_id)
        events = events.filter(subscription__plan_id=plan_id)

    states = dict(subscriptions.values_list('state').annotate(count=Count('id')))
    in_range = invoices.filter(state__in=ISSUED, invoice_date__range=(date_from, date_to))
    invoiced = in_range.aggregate(total=Sum('amount_total'), untaxed=Sum('amount_untaxed'), count=Count('id'))
    collected = payments.filter(payment_date__range=(date_from, date_to)).aggregate(total=Sum('amount'),
                                                                                    count=Count('id'))
    open_invoices = invoices.filter(state=Invoice.State.CONFIRMED).aggregate(
        outstanding=Sum('amount_due'), outstanding_count=Count('id'),
        overdue=Sum('amount_due', filter=Q(due_date__lt=today)), overdue_count=Count('id', filter=Q(due_date__lt=today)))
    movements = events.aggregate(new=Count('id', filter=Q(action='activate')),
                                 closed=Count('id', filter=Q(action='close')))
    by_plan = (in_range.values('subscription__plan__name')
               .annotate(revenue=Sum('amount_untaxed'), invoices=Count('id')).order_by('-revenue'))

    return {
        'period': {'date_from': date_from, 'date_to': date_to},
        'subscriptions': {
            'by_state': {state: states.get(state, 0) for state in Subscription.State.values},
            'active': states.get(Subscription.State.ACTIVE, 0),
            'new_in_period': movements['new'],
            'closed_in_period': movements['closed'],
        },
        'mrr': money(monthly_recurring_revenue(subscriptions)),
        'invoiced': {'total': money(invoiced['total']), 'untaxed': money(invoiced['untaxed']),
                     'count': invoiced['count']},
        'collected': {'total': money(collected['total']), 'count': collected['count']},
        'outstanding': {'total': money(open_invoices['outstanding']), 'count': open_invoices['outstanding_count']},
        'overdue': {'total': money(open_invoices['overdue']), 'count': open_invoices['overdue_count']},
        'draft_invoices': invoices.filter(state=Invoice.State.DRAFT).count(),
        'revenue_by_plan': [
            {'plan': row['subscription__plan__name'], 'revenue': money(row['revenue']), 'invoices': row['invoices']}
            for row in by_plan
        ],
    }


def revenue_trend(months, today, plan_id=None):
    start = date(today.year, today.month, 1) - relativedelta(months=months - 1)
    invoices = Invoice.objects.filter(state__in=ISSUED, invoice_date__gte=start, invoice_date__lte=today)
    payments = Payment.objects.filter(payment_date__gte=start, payment_date__lte=today)
    if plan_id:
        invoices = invoices.filter(subscription__plan_id=plan_id)
        payments = payments.filter(invoice__subscription__plan_id=plan_id)

    invoiced = dict(invoices.annotate(month=TruncMonth('invoice_date')).values('month')
                    .annotate(total=Sum('amount_total')).values_list('month', 'total'))
    collected = dict(payments.annotate(month=TruncMonth('payment_date')).values('month')
                     .annotate(total=Sum('amount')).values_list('month', 'total'))

    rows = []
    for offset in range(months):
        month = start + relativedelta(months=offset)
        rows.append({'month': month.strftime('%Y-%m'), 'invoiced': money(invoiced.get(month)),
                     'collected': money(collected.get(month))})
    return rows


def customer_summary(customer, today):
    subscriptions = Subscription.objects.filter(customer=customer)
    states = dict(subscriptions.values_list('state').annotate(count=Count('id')))
    invoices = Invoice.objects.filter(customer=customer, state=Invoice.State.CONFIRMED).aggregate(
        due=Sum('amount_due'), due_count=Count('id'),
        overdue=Sum('amount_due', filter=Q(due_date__lt=today)), overdue_count=Count('id', filter=Q(due_date__lt=today)))
    next_invoice = subscriptions.filter(state=Subscription.State.ACTIVE).aggregate(next=Min('next_invoice_date'))
    return {
        'active_subscriptions': states.get(Subscription.State.ACTIVE, 0),
        'paused_subscriptions': states.get(Subscription.State.PAUSED, 0),
        'quotations_to_review': states.get(Subscription.State.QUOTATION, 0),
        'amount_due': {'total': money(invoices['due']), 'count': invoices['due_count']},
        'overdue': {'total': money(invoices['overdue']), 'count': invoices['overdue_count']},
        'next_invoice_date': next_invoice['next'],
    }
