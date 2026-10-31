import random
from datetime import datetime, time, timedelta
from decimal import Decimal
from time import perf_counter

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from accounts.models import User
from billing.models import Invoice, InvoiceLine, Payment
from billing.services import next_period_start
from catalog.models import AttributeValue, Discount, Plan, Product, ProductAttribute, ProductVariant, Tax, round_money
from subscriptions.models import Subscription, SubscriptionEvent, SubscriptionLine

EMAIL_PREFIX = 'demo-customer-'
EMAIL_DOMAIN = '@example.test'
BATCH = 1000
COMPANY_WORDS = ['Acme', 'Blue', 'Cedar', 'Delta', 'Everest', 'Falcon', 'Granite', 'Harbor', 'Indigo', 'Juniper',
                 'Kestrel', 'Lotus', 'Maple', 'Nimbus', 'Orbit', 'Pioneer', 'Quartz', 'Ridge', 'Saffron', 'Teak']
COMPANY_TYPES = ['Traders', 'Retail', 'Labs', 'Logistics', 'Foods', 'Studios', 'Clinics', 'Systems', 'Exports', 'Works']
STATE_WEIGHTS = [
    (Subscription.State.ACTIVE, 70), (Subscription.State.PAUSED, 6), (Subscription.State.CLOSED, 9),
    (Subscription.State.QUOTATION, 6), (Subscription.State.CONFIRMED, 4), (Subscription.State.DRAFT, 5),
]
DEMO_LOGINS = [
    {'email': 'admin@brightloop.local', 'password': 'Brightloop#Admin1', 'role': User.Role.ADMIN,
     'first_name': 'Ada', 'last_name': 'Admin'},
    {'email': 'ravi@brightloop.local', 'password': 'Harbour#Lamp42', 'role': User.Role.STAFF,
     'first_name': 'Ravi', 'last_name': 'Kumar'},
    {'email': 'asha@smallshop.test', 'password': 'Shopper#2026x', 'role': User.Role.CUSTOMER,
     'first_name': 'Asha', 'company_name': 'Small Shop'},
]
METHODS = [Payment.Method.BANK_TRANSFER, Payment.Method.UPI, Payment.Method.UPI, Payment.Method.CARD,
           Payment.Method.CHEQUE]


class Command(BaseCommand):
    help = 'Fills the database with demo customers, subscriptions, invoices and payments for testing scale.'

    def add_arguments(self, parser):
        parser.add_argument('--subscriptions', type=int, default=3000)
        parser.add_argument('--months', type=int, default=8, help='How many months of history to create.')
        parser.add_argument('--reset', action='store_true', help='Remove previously generated demo data first.')

    def handle(self, *args, **options):
        started = perf_counter()
        self.random = random.Random(42)
        self.today = timezone.localdate()

        with transaction.atomic():
            for email in self.demo_logins():
                self.stdout.write(f'Created login {email}')
            if options['reset']:
                self.stdout.write(f'Removed {self.reset()} demo customers and their data.')
            elif User.objects.filter(email__startswith=EMAIL_PREFIX).exists():
                self.stdout.write(self.style.WARNING('Demo data already exists. Use --reset to recreate it.'))
                return
            catalog = self.catalog()
            customers = self.customers(max(options['subscriptions'] // 5, 1))
            subscriptions = self.subscriptions(options['subscriptions'], options['months'], customers, catalog)
            invoices, payments = self.history(subscriptions)

        self.stdout.write(self.style.SUCCESS(
            f'Created {len(customers)} customers, {len(subscriptions)} subscriptions, {invoices} invoices and '
            f'{payments} payments in {perf_counter() - started:.1f}s.'))

    def demo_logins(self):
        created = []
        for login in DEMO_LOGINS:
            if User.objects.filter(email=login['email']).exists():
                continue
            fields = {key: value for key, value in login.items() if key not in ('email', 'password')}
            if login['role'] == User.Role.ADMIN:
                User.objects.create_superuser(login['email'], login['password'], **fields)
            else:
                User.objects.create_user(login['email'], login['password'], **fields)
            created.append(login['email'])
        return created

    def reset(self):
        demo = User.objects.filter(email__startswith=EMAIL_PREFIX, email__endswith=EMAIL_DOMAIN)
        Payment.objects.filter(invoice__customer__in=demo).delete()
        Invoice.objects.filter(customer__in=demo).delete()
        Subscription.objects.filter(customer__in=demo).delete()
        return demo.delete()[1].get('accounts.User', 0)

    def catalog(self):
        gst, _ = Tax.objects.get_or_create(name='GST 18%', defaults={'amount': Decimal('18')})
        brand, _ = ProductAttribute.objects.get_or_create(name='Brand')
        odoo, _ = AttributeValue.objects.get_or_create(attribute=brand, name='Odoo',
                                                       defaults={'extra_price': Decimal('560')})
        products = []
        for name, kind, price, cost in [('Brightloop CRM', 'service', '1000', '300'),
                                        ('Analytics add-on', 'addon', '300', '60'),
                                        ('Backup add-on', 'addon', '200', '40'),
                                        ('Onboarding pack', 'goods', '1500', '700')]:
            product, created = Product.objects.get_or_create(
                name=name, defaults={'product_type': kind, 'sales_price': Decimal(price), 'cost_price': Decimal(cost)})
            if created:
                product.taxes.set([gst])
            products.append(product)
        crm_odoo = ProductVariant.objects.filter(product=products[0], values=odoo).first()
        if crm_odoo is None:
            crm_odoo = ProductVariant.objects.create(product=products[0])
            crm_odoo.values.set([odoo])

        plans = []
        for name, price, period, minimum in [('Starter Monthly', '499', 'monthly', 1),
                                             ('Pro Monthly', '999', 'monthly', 5),
                                             ('Business Yearly', '99000', 'yearly', 10),
                                             ('Field Team Weekly', '250', 'weekly', 3)]:
            plan, created = Plan.objects.get_or_create(
                name=name, defaults={'price': Decimal(price), 'billing_period': period, 'min_quantity': minimum,
                                     'start_date': self.today - timedelta(days=3650), 'pausable': True,
                                     'auto_close': period == 'yearly'})
            if created:
                plan.taxes.set([gst])
            plans.append(plan)
        Discount.objects.get_or_create(name='Seat bundle 10%', defaults={
            'value': Decimal('10'), 'min_quantity': 25, 'start_date': self.today - timedelta(days=30)})
        return {'plans': plans, 'products': products, 'crm_odoo': crm_odoo, 'gst': gst}

    def customers(self, count):
        password = make_password(None)
        users = []
        for i in range(1, count + 1):
            company = f'{self.random.choice(COMPANY_WORDS)} {self.random.choice(COMPANY_TYPES)} {i}'
            users.append(User(email=f'{EMAIL_PREFIX}{i:04d}{EMAIL_DOMAIN}', password=password, company_name=company,
                              first_name='Demo', last_name=f'Customer {i}', role=User.Role.CUSTOMER,
                              address=f'{i} Demo Street, Bengaluru'))
        return User.objects.bulk_create(users, batch_size=BATCH)

    def subscriptions(self, count, months, customers, catalog):
        states, weights = zip(*STATE_WEIGHTS)
        next_number = (Subscription.objects.aggregate(top=Max('id'))['top'] or 0) + 1
        products, crm_odoo, gst = catalog['products'], catalog['crm_odoo'], catalog['gst']
        subscriptions, line_specs = [], []

        for i in range(count):
            plan = self.random.choice(catalog['plans'])
            state = self.random.choices(states, weights)[0]
            start = self.today - timedelta(days=self.random.randint(0, months * 30))
            years = 1 if plan.billing_period != 'yearly' else self.random.choice([1, 2])
            expiry = start + timedelta(days=365 * years)
            subscription = Subscription(
                number=f'SUB/{start.year}/{next_number + i:05d}', customer=self.random.choice(customers), plan=plan,
                state=state, start_date=start, expiry_date=expiry, term_days=(expiry - start).days,
                payment_terms_days=self.random.choice([0, 15, 30]),
                quotation_valid_until=self.today + timedelta(days=15) if state == Subscription.State.QUOTATION else None)

            lines = [('plan', None, None, plan.name, plan.min_quantity + self.random.randint(0, 20), plan.price)]
            for product in self.random.sample(products[1:3], self.random.randint(0, 2)):
                lines.append(('product', product, None, product.name, self.random.randint(1, 5), product.sales_price))
            if self.random.random() < 0.4:
                lines.append(('product', products[0], crm_odoo, f'{products[0].name} – {crm_odoo.name}',
                              self.random.randint(1, 10), crm_odoo.price))
            subscription.amount_untaxed = sum((round_money(price * qty) for *_, qty, price in lines), Decimal('0'))
            subscription.amount_tax = round_money(subscription.amount_untaxed * gst.amount / 100)
            subscription.amount_total = subscription.amount_untaxed + subscription.amount_tax
            subscriptions.append(subscription)
            line_specs.append(lines)

        Subscription.objects.bulk_create(subscriptions, batch_size=BATCH)

        line_objects = []
        for subscription, lines in zip(subscriptions, line_specs):
            for line_type, product, variant, description, quantity, price in lines:
                subtotal = round_money(price * quantity)
                tax = round_money(subtotal * gst.amount / 100)
                line_objects.append(SubscriptionLine(
                    subscription=subscription, line_type=line_type, product=product, variant=variant,
                    description=description, quantity=quantity, unit_price=price, subtotal=subtotal,
                    tax_amount=tax, total=subtotal + tax))
        SubscriptionLine.objects.bulk_create(line_objects, batch_size=BATCH)
        SubscriptionLine.taxes.through.objects.bulk_create(
            [SubscriptionLine.taxes.through(subscriptionline_id=line.pk, tax_id=gst.pk) for line in line_objects],
            batch_size=BATCH)
        self.line_objects = line_objects
        return subscriptions

    def history(self, subscriptions):
        lines_by_subscription = {}
        for line in self.line_objects:
            lines_by_subscription.setdefault(line.subscription_id, []).append(line)

        next_number = (Invoice.objects.aggregate(top=Max('id'))['top'] or 0) + 1
        invoices, invoice_lines, payment_specs, events = [], [], [], []
        billed_states = {Subscription.State.ACTIVE, Subscription.State.PAUSED, Subscription.State.CLOSED}

        for subscription in subscriptions:
            if subscription.state not in billed_states:
                continue
            events.append(SubscriptionEvent(subscription=subscription, action='activate',
                                            from_state=Subscription.State.CONFIRMED,
                                            to_state=Subscription.State.ACTIVE))
            period = subscription.start_date
            last_period = self.today if subscription.state != Subscription.State.CLOSED else \
                self.today - timedelta(days=self.random.randint(0, 60))
            while period <= last_period and period <= subscription.expiry_date:
                following = next_period_start(subscription, period)
                invoice, lines = self.invoice(subscription, period, following, lines_by_subscription[subscription.pk],
                                              next_number + len(invoices))
                invoices.append(invoice)
                invoice_lines.append(lines)
                period = following
            if subscription.state == Subscription.State.CLOSED:
                events.append(SubscriptionEvent(subscription=subscription, action='close',
                                                from_state=Subscription.State.ACTIVE,
                                                to_state=Subscription.State.CLOSED))
            else:
                subscription.next_invoice_date = period
        Subscription.objects.bulk_update(
            [s for s in subscriptions if s.next_invoice_date], ['next_invoice_date'], batch_size=BATCH)

        Invoice.objects.bulk_create(invoices, batch_size=BATCH)
        InvoiceLine.objects.bulk_create(
            [line for invoice, lines in zip(invoices, invoice_lines) for line in self.attach(invoice, lines)],
            batch_size=BATCH)

        payments = []
        for invoice in invoices:
            if invoice.state == Invoice.State.PAID:
                paid_on = min(invoice.invoice_date + timedelta(days=self.random.randint(0, 20)), self.today)
                payments.append(Payment(invoice=invoice, method=self.random.choice(METHODS), amount=invoice.amount_total,
                                        payment_date=paid_on, note='Demo payment'))
        Payment.objects.bulk_create(payments, batch_size=BATCH)

        SubscriptionEvent.objects.bulk_create(events, batch_size=BATCH)
        for event in events:
            day = event.subscription.start_date if event.action == 'activate' else self.today - timedelta(
                days=self.random.randint(0, 60))
            event.created_at = timezone.make_aware(datetime.combine(day, time.min))
        SubscriptionEvent.objects.bulk_update(events, ['created_at'], batch_size=BATCH)
        return len(invoices), len(payments)

    def invoice(self, subscription, period, following, lines, number):
        due = period + timedelta(days=subscription.payment_terms_days)
        latest = following > self.today
        roll = self.random.random()
        if latest and roll < 0.3:
            state = Invoice.State.DRAFT
        elif due >= self.today or roll < 0.12:
            state = Invoice.State.CONFIRMED
        else:
            state = Invoice.State.PAID
        customer = subscription.customer
        invoice = Invoice(
            number=f'INV/{period.year}/{number:05d}', subscription=subscription, customer=customer,
            billing_name=customer.company_name, billing_email=customer.email, billing_address=customer.address,
            state=state, invoice_date=period, due_date=due, period_start=period,
            period_end=min(following - timedelta(days=1), subscription.expiry_date),
            amount_untaxed=subscription.amount_untaxed, amount_tax=subscription.amount_tax,
            amount_total=subscription.amount_total)
        invoice.amount_paid = invoice.amount_total if state == Invoice.State.PAID else Decimal('0')
        invoice.amount_due = invoice.amount_total - invoice.amount_paid
        invoice.paid_at = timezone.now() if state == Invoice.State.PAID else None
        copies = [InvoiceLine(product_id=line.product_id, description=line.description, quantity=line.quantity,
                              unit_price=line.unit_price, subtotal=line.subtotal, tax_label='GST 18%',
                              tax_amount=line.tax_amount, total=line.total) for line in lines]
        return invoice, copies

    @staticmethod
    def attach(invoice, lines):
        for line in lines:
            line.invoice = invoice
        return lines
