from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Subscription, SubscriptionEvent, SubscriptionLine

State = Subscription.State
DEFAULT_QUOTATION_DAYS = 30


class TransitionError(Exception):
    pass


@dataclass(frozen=True)
class Action:
    label: str
    from_states: frozenset
    to_state: str = None
    plan_flag: str = None
    customer_from_states: frozenset = frozenset()


ACTIONS = {
    'send_quotation': Action('Send quotation', frozenset({State.DRAFT}), State.QUOTATION),
    'confirm': Action('Confirm', frozenset({State.DRAFT, State.QUOTATION}), State.CONFIRMED,
                      customer_from_states=frozenset({State.QUOTATION})),
    'activate': Action('Activate', frozenset({State.CONFIRMED}), State.ACTIVE),
    'pause': Action('Pause', frozenset({State.ACTIVE}), State.PAUSED, plan_flag='pausable',
                    customer_from_states=frozenset({State.ACTIVE})),
    'resume': Action('Resume', frozenset({State.PAUSED}), State.ACTIVE,
                     customer_from_states=frozenset({State.PAUSED})),
    'renew': Action('Renew', frozenset({State.ACTIVE}), State.ACTIVE, plan_flag='renewable',
                    customer_from_states=frozenset({State.ACTIVE})),
    'close': Action('Close', frozenset({State.DRAFT, State.QUOTATION, State.CONFIRMED, State.ACTIVE, State.PAUSED}),
                    State.CLOSED, customer_from_states=frozenset({State.QUOTATION, State.ACTIVE, State.PAUSED})),
}

RUNNING_STATES = {State.ACTIVE, State.PAUSED}


def _blocked_reason(subscription, name, user):
    action = ACTIONS[name]
    allowed_from = action.from_states if user.is_internal else action.customer_from_states
    if subscription.state not in allowed_from:
        return f'Cannot {action.label.lower()} a subscription that is {subscription.get_state_display().lower()}.'
    if action.plan_flag and not getattr(subscription.plan, action.plan_flag):
        return f'The {subscription.plan.name} plan does not allow this.'
    if name == 'close' and subscription.state in RUNNING_STATES and not subscription.plan.closable:
        return f'The {subscription.plan.name} plan cannot be closed early.'
    if name == 'confirm' and subscription.quotation_valid_until and \
            subscription.quotation_valid_until < timezone.localdate():
        return 'This quotation has expired. Send a new quotation first.'
    return None


def available_actions(subscription, user):
    return [name for name in ACTIONS if _blocked_reason(subscription, name, user) is None]


def perform_action(subscription, name, user, note=''):
    if name not in ACTIONS:
        raise TransitionError(f'Unknown action "{name}".')

    with transaction.atomic():
        subscription = Subscription.objects.select_for_update().select_related('plan').get(pk=subscription.pk)
        reason = _blocked_reason(subscription, name, user)
        if reason:
            raise TransitionError(reason)

        today = timezone.localdate()
        from_state = subscription.state
        if name == 'send_quotation' and (not subscription.quotation_valid_until
                                         or subscription.quotation_valid_until < today):
            subscription.quotation_valid_until = today + timedelta(days=DEFAULT_QUOTATION_DAYS)
        elif name == 'activate':
            subscription.next_invoice_date = subscription.start_date
        elif name == 'resume' and subscription.next_invoice_date and subscription.next_invoice_date < today:
            subscription.next_invoice_date = today
        elif name == 'renew':
            subscription.expiry_date += timedelta(days=subscription.term_days)
        elif name == 'close':
            subscription.next_invoice_date = None

        subscription.state = ACTIONS[name].to_state
        subscription.save()
        SubscriptionEvent.objects.create(subscription=subscription, action=name, from_state=from_state,
                                         to_state=subscription.state, user=user, note=note)
    return subscription


def default_unit_price(product, variant):
    return variant.price if variant else product.sales_price


def line_description(product, variant):
    return f'{product.name} – {variant.name}' if variant else product.name


@transaction.atomic
def replace_lines(subscription, plan_quantity, product_lines):
    subscription.lines.all().delete()
    plan_line = SubscriptionLine.objects.create(
        subscription=subscription, line_type=SubscriptionLine.LineType.PLAN, description=subscription.plan.name,
        quantity=plan_quantity, unit_price=subscription.plan.price)
    plan_line.taxes.set(subscription.plan.taxes.all())

    for data in product_lines:
        product, variant = data['product'], data.get('variant')
        line = SubscriptionLine.objects.create(
            subscription=subscription, product=product, variant=variant,
            description=data.get('description') or line_description(product, variant),
            quantity=data['quantity'],
            unit_price=data['unit_price'] if data.get('unit_price') is not None else default_unit_price(product, variant))
        line.taxes.set(product.taxes.all())
    subscription.recompute_totals()


@transaction.atomic
def create_from_template(template, customer, start_date, user):
    plan = template.plan
    subscription = Subscription.objects.create(
        customer=customer, plan=plan, template=template, start_date=start_date,
        expiry_date=start_date + timedelta(days=365),
        quotation_valid_until=timezone.localdate() + timedelta(days=template.validity_days),
        notes=template.notes, created_by=user)
    replace_lines(subscription, template.plan_quantity, [
        {'product': line.product, 'variant': line.variant, 'quantity': line.quantity}
        for line in template.lines.select_related('product', 'variant')
    ])
    SubscriptionEvent.objects.create(subscription=subscription, action='create', to_state=subscription.state,
                                     user=user, note=f'Created from template "{template.name}"')
    return subscription
