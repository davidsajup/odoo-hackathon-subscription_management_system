import logging
from datetime import timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from catalog.models import Discount, Plan, round_money
from subscriptions.models import Subscription, SubscriptionEvent

from .models import Invoice, InvoiceLine, Payment

logger = logging.getLogger(__name__)
ZERO = Decimal('0')


class BillingError(Exception):
    pass


def next_period_start(subscription, current):
    plan = subscription.plan
    interval = plan.billing_interval
    if plan.billing_period == Plan.BillingPeriod.DAILY:
        return current + timedelta(days=interval)
    if plan.billing_period == Plan.BillingPeriod.WEEKLY:
        return current + timedelta(weeks=interval)

    # Months are counted from the original start date so a subscription that starts on the 31st
    # bills on Feb 28, Mar 31, Apr 30… instead of drifting to the 28th forever.
    step = interval * (12 if plan.billing_period == Plan.BillingPeriod.YEARLY else 1)
    anchor = subscription.start_date
    elapsed = (current.year - anchor.year) * 12 + current.month - anchor.month
    k = max(elapsed // step, 0) + 1
    candidate = anchor + relativedelta(months=k * step)
    while candidate <= current:
        k += 1
        candidate = anchor + relativedelta(months=k * step)
    return candidate


def discount_allocation(discount, lines):
    product_ids = {product.pk for product in discount.products.all()}
    eligible = [i for i, line in enumerate(lines)
                if discount.scope == Discount.Scope.SUBSCRIPTION or line['product_id'] in product_ids]
    if not eligible:
        return {}

    base = sum((lines[i]['gross'] for i in eligible), ZERO)
    quantity = sum(lines[i]['quantity'] for i in eligible)
    if base <= ZERO or quantity < discount.min_quantity or base < discount.min_purchase_amount:
        return {}

    if discount.discount_type == Discount.DiscountType.PERCENT:
        return {i: round_money(lines[i]['gross'] * discount.value / 100) for i in eligible}

    # A fixed discount is shared across lines in proportion to their amount, so each line's tax is
    # computed on its own discounted price. Rounding leftovers go to the last line so the parts add up exactly.
    total = min(discount.value, base)
    allocation, allocated = {}, ZERO
    for i in eligible[:-1]:
        allocation[i] = round_money(total * lines[i]['gross'] / base)
        allocated += allocation[i]
    allocation[eligible[-1]] = total - allocated
    return allocation


def best_discount(lines, on_date):
    candidates = (Discount.objects.filter(is_active=True, start_date__lte=on_date)
                  .filter(Q(end_date__isnull=True) | Q(end_date__gte=on_date))
                  .prefetch_related('products'))
    best, best_allocation, best_total = None, {}, ZERO
    for discount in candidates:
        if not discount.is_usable_on(on_date):
            continue
        allocation = discount_allocation(discount, lines)
        total = sum(allocation.values(), ZERO)
        if total > best_total:
            best, best_allocation, best_total = discount, allocation, total
    return best, best_allocation


def claim_discount(discount, on_date):
    locked = Discount.objects.select_for_update().get(pk=discount.pk)
    if not locked.is_usable_on(on_date):
        return False
    Discount.objects.filter(pk=locked.pk).update(used_count=F('used_count') + 1)
    return True


def is_due(subscription, today):
    return (subscription.state == Subscription.State.ACTIVE
            and subscription.next_invoice_date is not None
            and subscription.next_invoice_date <= today
            and subscription.next_invoice_date <= subscription.expiry_date)


def generate_invoice(subscription_id, today=None, user=None):
    today = today or timezone.localdate()
    with transaction.atomic():
        subscription = (Subscription.objects.select_for_update().select_related('plan', 'customer')
                        .get(pk=subscription_id))
        if not is_due(subscription, today):
            raise BillingError(f'{subscription.number} has nothing due for invoicing.')

        period_start = subscription.next_invoice_date
        following = next_period_start(subscription, period_start)
        if Invoice.objects.filter(subscription=subscription, period_start=period_start).exclude(
                state=Invoice.State.CANCELLED).exists():
            raise BillingError(f'{subscription.number} is already invoiced for the period starting {period_start}.')

        lines = [
            {'source': line, 'product_id': line.product_id, 'quantity': line.quantity,
             'gross': round_money(line.unit_price * line.quantity)}
            for line in subscription.lines.prefetch_related('taxes')
        ]
        discount, allocation = best_discount(lines, today)
        if discount and not claim_discount(discount, today):
            discount, allocation = None, {}

        customer = subscription.customer
        invoice = Invoice.objects.create(
            subscription=subscription, customer=customer,
            billing_name=customer.company_name or customer.get_full_name() or customer.email,
            billing_email=customer.email, billing_address=customer.address,
            invoice_date=today, due_date=today + timedelta(days=subscription.payment_terms_days),
            period_start=period_start, period_end=min(following - timedelta(days=1), subscription.expiry_date),
            discount=discount)

        for index, data in enumerate(lines):
            source = data['source']
            discount_amount = allocation.get(index, ZERO)
            subtotal = data['gross'] - discount_amount
            taxes = list(source.taxes.all())
            tax_amount = sum((tax.compute(subtotal, source.quantity) for tax in taxes), ZERO)
            InvoiceLine.objects.create(
                invoice=invoice, product_id=source.product_id, description=source.description,
                quantity=source.quantity, unit_price=source.unit_price, discount_amount=discount_amount,
                subtotal=subtotal, tax_label=', '.join(tax.name for tax in taxes), tax_amount=tax_amount,
                total=subtotal + tax_amount)
        invoice.recompute_totals()
        invoice.save()

        subscription.next_invoice_date = following
        subscription.save(update_fields=['next_invoice_date', 'updated_at'])
        SubscriptionEvent.objects.create(
            subscription=subscription, action='invoice', from_state=subscription.state, to_state=subscription.state,
            user=user, note=f'{invoice.number} for {period_start:%d %b %Y} – {invoice.period_end:%d %b %Y}')
    return invoice


def generate_due_invoices(today=None, user=None):
    today = today or timezone.localdate()
    created, failed = [], []
    due_ids = Subscription.objects.filter(state=Subscription.State.ACTIVE, next_invoice_date__lte=today).values_list(
        'pk', flat=True)
    for subscription_id in due_ids:
        while True:
            try:
                created.append(generate_invoice(subscription_id, today, user))
            except BillingError:
                break
            except Exception:
                logger.exception('Billing failed for subscription %s', subscription_id)
                failed.append(subscription_id)
                break
    return {'created': len(created), 'invoice_numbers': [invoice.number for invoice in created], 'failed': failed}


INVOICE_ACTIONS = {
    'confirm': {Invoice.State.DRAFT},
    'cancel': {Invoice.State.DRAFT, Invoice.State.CONFIRMED},
    'send': {Invoice.State.CONFIRMED, Invoice.State.PAID},
}


def available_invoice_actions(invoice):
    actions = [name for name, states in INVOICE_ACTIONS.items() if invoice.state in states]
    if invoice.amount_paid > ZERO and 'cancel' in actions:
        actions.remove('cancel')
    return actions


def send_invoice_email(invoice):
    lines = '\n'.join(f'  {line.description} × {line.quantity}: {line.total}' for line in invoice.lines.all())
    send_mail(
        f'Invoice {invoice.number} from Brightloop',
        f'Hello {invoice.billing_name},\n\nYour invoice {invoice.number} for '
        f'{invoice.period_start:%d %b %Y} – {invoice.period_end:%d %b %Y}:\n{lines}\n\n'
        f'Total: {invoice.amount_total}\nAmount due: {invoice.amount_due}\nDue date: {invoice.due_date:%d %b %Y}\n\n'
        f'View it online: {settings.FRONTEND_URL}/portal/invoices/{invoice.pk}',
        None,
        [invoice.billing_email],
    )


def perform_invoice_action(invoice, name):
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if name not in available_invoice_actions(invoice):
            raise BillingError(f'Cannot {name} an invoice that is {invoice.get_state_display().lower()}'
                               f'{" and has payments" if invoice.amount_paid else ""}.')
        now = timezone.now()
        if name == 'confirm':
            invoice.state = Invoice.State.PAID if invoice.amount_total == ZERO else Invoice.State.CONFIRMED
            invoice.confirmed_at = now
            invoice.paid_at = now if invoice.state == Invoice.State.PAID else None
        elif name == 'cancel':
            invoice.state = Invoice.State.CANCELLED
            _release_discount(invoice)
            _rewind_subscription(invoice)
        elif name == 'send':
            send_invoice_email(invoice)
            invoice.sent_at = now
        invoice.save()
    return invoice


def _release_discount(invoice):
    if invoice.discount_id:
        Discount.objects.filter(pk=invoice.discount_id, used_count__gt=0).update(used_count=F('used_count') - 1)


def _rewind_subscription(invoice):
    subscription = Subscription.objects.select_for_update().select_related('plan').get(pk=invoice.subscription_id)
    latest_period = subscription.next_invoice_date == next_period_start(subscription, invoice.period_start)
    if subscription.state in (Subscription.State.ACTIVE, Subscription.State.PAUSED) and latest_period:
        subscription.next_invoice_date = invoice.period_start
        subscription.save(update_fields=['next_invoice_date', 'updated_at'])


def confirm_drafts(invoice_ids=None):
    drafts = Invoice.objects.filter(state=Invoice.State.DRAFT)
    if invoice_ids is not None:
        drafts = drafts.filter(pk__in=invoice_ids)
    confirmed = 0
    for invoice in drafts:
        perform_invoice_action(invoice, 'confirm')
        confirmed += 1
    return confirmed


def record_payment(invoice, amount, method, payment_date, note='', user=None):
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if invoice.state != Invoice.State.CONFIRMED:
            raise BillingError('Payments can only be recorded against confirmed, unpaid invoices.')
        if amount > invoice.amount_due:
            raise BillingError(f'The amount is more than the {invoice.amount_due} still due.')
        payment = Payment.objects.create(invoice=invoice, amount=amount, method=method, payment_date=payment_date,
                                         note=note, recorded_by=user)
        invoice.amount_paid += amount
        invoice.amount_due = invoice.amount_total - invoice.amount_paid
        if invoice.amount_due == ZERO:
            invoice.state = Invoice.State.PAID
            invoice.paid_at = timezone.now()
        invoice.save()
    return payment


def delete_payment(payment):
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=payment.invoice_id)
        payment.delete()
        invoice.amount_paid -= payment.amount
        invoice.amount_due = invoice.amount_total - invoice.amount_paid
        if invoice.state == Invoice.State.PAID:
            invoice.state = Invoice.State.CONFIRMED
            invoice.paid_at = None
        invoice.save()
