from datetime import date, timedelta
from decimal import Decimal

from django.core import mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Discount, Plan, Product, Tax
from subscriptions import services as subscription_services
from subscriptions.models import Subscription

from . import services
from .models import Invoice, Payment

PASSWORD = 'Brightloop#2026'


class BillingTestCase(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.staff = User.objects.create_user('rep@brightloop.com', PASSWORD, role=User.Role.STAFF)
        self.customer = User.objects.create_user('buyer@bigcorp.com', PASSWORD, company_name='Big Corp',
                                                 address='1 MG Road, Bengaluru')
        self.other_customer = User.objects.create_user('other@shop.com', PASSWORD)
        self.gst = Tax.objects.create(name='GST 18%', amount=Decimal('18'))
        self.plan = Plan.objects.create(name='Pro Monthly', price=Decimal('999'), min_quantity=5,
                                        start_date=date(2020, 1, 1))
        self.plan.taxes.set([self.gst])
        self.crm = Product.objects.create(name='CRM seat', sales_price=Decimal('1560'))
        self.crm.taxes.set([self.gst])
        self.backup = Product.objects.create(name='Backup add-on', sales_price=Decimal('200'))
        self.backup.taxes.set([self.gst])
        self.client.force_authenticate(self.staff)

    def make_subscription(self, start=None, state=Subscription.State.ACTIVE, customer=None, plan_quantity=5,
                          expiry=None, payment_terms_days=30):
        start = start or self.today
        subscription = Subscription.objects.create(
            customer=customer or self.customer, plan=self.plan, start_date=start,
            expiry_date=expiry or start + timedelta(days=365), payment_terms_days=payment_terms_days)
        subscription_services.replace_lines(subscription, plan_quantity, [
            {'product': self.crm, 'quantity': 2},
            {'product': self.backup, 'quantity': 1},
        ])
        Subscription.objects.filter(pk=subscription.pk).update(
            state=state, next_invoice_date=start if state == Subscription.State.ACTIVE else None)
        subscription.refresh_from_db()
        return subscription

    def invoice_for(self, subscription):
        return services.generate_invoice(subscription.pk, self.today)


class InvoiceGenerationTests(BillingTestCase):
    def test_invoice_is_built_from_subscription(self):
        subscription = self.make_subscription()
        invoice = self.invoice_for(subscription)

        self.assertRegex(invoice.number, r'^INV/\d{4}/\d{5}$')
        self.assertEqual(invoice.state, Invoice.State.DRAFT)
        self.assertEqual((invoice.billing_name, invoice.billing_email, invoice.billing_address),
                         ('Big Corp', 'buyer@bigcorp.com', '1 MG Road, Bengaluru'))
        self.assertEqual(invoice.due_date, self.today + timedelta(days=30))
        self.assertEqual([(line.description, line.quantity, line.tax_label, line.total) for line in invoice.lines.all()], [
            ('Pro Monthly', 5, 'GST 18%', Decimal('5894.10')),
            ('CRM seat', 2, 'GST 18%', Decimal('3681.60')),
            ('Backup add-on', 1, 'GST 18%', Decimal('236.00')),
        ])
        self.assertEqual((invoice.amount_untaxed, invoice.amount_tax, invoice.amount_total, invoice.amount_due),
                         (Decimal('8315.00'), Decimal('1496.70'), Decimal('9811.70'), Decimal('9811.70')))

        subscription.refresh_from_db()
        self.assertGreater(subscription.next_invoice_date, self.today)
        self.assertEqual(invoice.period_end, subscription.next_invoice_date - timedelta(days=1))
        self.assertEqual(subscription.events.first().action, 'invoice')

    def test_never_bills_the_same_period_twice(self):
        subscription = self.make_subscription()
        first = self.invoice_for(subscription)
        with self.assertRaises(services.BillingError):
            self.invoice_for(subscription)

        Subscription.objects.filter(pk=subscription.pk).update(next_invoice_date=first.period_start)
        with self.assertRaises(services.BillingError):
            self.invoice_for(subscription)

        duplicate = Invoice(subscription=subscription, customer=self.customer, billing_name='x',
                            billing_email='x@x.com', invoice_date=self.today, due_date=self.today,
                            period_start=first.period_start, period_end=first.period_end)
        with self.assertRaises(IntegrityError), transaction.atomic():
            duplicate.save()

    def test_billing_run_catches_up_without_skipping(self):
        start = self.today - timedelta(days=75)
        subscription = self.make_subscription(start=start)
        expected, period = [], start
        while period <= self.today:
            expected.append(period)
            period = services.next_period_start(subscription, period)

        result = services.generate_due_invoices(self.today)
        self.assertEqual(result['created'], len(expected))
        self.assertEqual(list(subscription.invoices.order_by('period_start').values_list('period_start', flat=True)),
                         expected)
        self.assertEqual(services.generate_due_invoices(self.today)['created'], 0)

    def test_skips_subscriptions_that_are_not_billable(self):
        self.make_subscription(state=Subscription.State.CONFIRMED)
        self.make_subscription(state=Subscription.State.PAUSED)
        self.make_subscription(state=Subscription.State.CLOSED)
        self.make_subscription(start=self.today - timedelta(days=40), expiry=self.today - timedelta(days=20))
        result = services.generate_due_invoices(self.today)
        self.assertEqual(result['created'], 1)

    def test_month_end_start_does_not_drift(self):
        subscription = Subscription(plan=self.plan, start_date=date(2027, 1, 31))
        feb = services.next_period_start(subscription, date(2027, 1, 31))
        mar = services.next_period_start(subscription, feb)
        self.assertEqual((feb, mar), (date(2027, 2, 28), date(2027, 3, 31)))

        self.plan.billing_period, self.plan.billing_interval = Plan.BillingPeriod.YEARLY, 1
        self.assertEqual(services.next_period_start(subscription, date(2027, 1, 31)), date(2028, 1, 31))
        self.plan.billing_period, self.plan.billing_interval = Plan.BillingPeriod.WEEKLY, 2
        self.assertEqual(services.next_period_start(subscription, date(2027, 1, 31)), date(2027, 2, 14))


class DiscountTests(BillingTestCase):
    def discount(self, **fields):
        fields.setdefault('name', 'Promo')
        fields.setdefault('start_date', self.today - timedelta(days=1))
        products = fields.pop('products', [])
        discount = Discount.objects.create(**fields)
        discount.products.set(products)
        return discount

    def test_percentage_discount_on_whole_subscription(self):
        discount = self.discount(value=Decimal('10'), min_quantity=5, usage_limit=10)
        invoice = self.invoice_for(self.make_subscription())
        self.assertEqual(invoice.discount, discount)
        self.assertEqual(invoice.amount_discount, Decimal('831.50'))
        self.assertEqual(invoice.amount_untaxed, Decimal('7483.50'))
        self.assertEqual(invoice.amount_tax, Decimal('1347.03'))
        discount.refresh_from_db()
        self.assertEqual(discount.used_count, 1)

    def test_product_discount_touches_only_those_products(self):
        self.discount(value=Decimal('50'), scope=Discount.Scope.PRODUCTS, products=[self.crm])
        invoice = self.invoice_for(self.make_subscription())
        discounts = [line.discount_amount for line in invoice.lines.all()]
        self.assertEqual(discounts, [Decimal('0'), Decimal('1560.00'), Decimal('0')])

    def test_fixed_discount_is_split_and_adds_up_exactly(self):
        self.discount(discount_type=Discount.DiscountType.FIXED, value=Decimal('1000'))
        invoice = self.invoice_for(self.make_subscription())
        self.assertEqual(invoice.amount_discount, Decimal('1000.00'))
        self.assertEqual(invoice.amount_untaxed, Decimal('7315.00'))
        self.assertEqual(sum(line.discount_amount for line in invoice.lines.all()), Decimal('1000.00'))

    def test_conditions_dates_and_usage_limit(self):
        self.discount(name='Big buyers', value=Decimal('10'), min_purchase_amount=Decimal('100000'))
        self.discount(name='Expired', value=Decimal('10'), start_date=self.today - timedelta(days=10),
                      end_date=self.today - timedelta(days=1))
        self.discount(name='Future', value=Decimal('10'), start_date=self.today + timedelta(days=1))
        self.assertIsNone(self.invoice_for(self.make_subscription()).discount)

        once = self.discount(name='Once', value=Decimal('5'), usage_limit=1)
        self.assertEqual(self.invoice_for(self.make_subscription()).discount, once)
        self.assertIsNone(self.invoice_for(self.make_subscription()).discount)

    def test_best_discount_wins(self):
        self.discount(name='Small', value=Decimal('5'))
        big = self.discount(name='Big', discount_type=Discount.DiscountType.FIXED, value=Decimal('2000'))
        self.assertEqual(self.invoice_for(self.make_subscription()).discount, big)

    def test_full_discount_invoice_is_paid_on_confirm(self):
        self.discount(value=Decimal('100'))
        invoice = self.invoice_for(self.make_subscription())
        self.assertEqual(invoice.amount_total, Decimal('0'))
        self.assertEqual(services.perform_invoice_action(invoice, 'confirm').state, Invoice.State.PAID)


class InvoiceActionTests(BillingTestCase):
    def test_confirm_send_and_cancel_flow(self):
        invoice = self.invoice_for(self.make_subscription())
        response = self.client.post(f'/api/invoices/{invoice.pk}/actions/confirm/')
        self.assertEqual(response.data['state'], 'confirmed')
        self.assertEqual(response.data['available_actions'], ['cancel', 'send'])

        response = self.client.post(f'/api/invoices/{invoice.pk}/actions/send/')
        self.assertIsNotNone(response.data['sent_at'])
        self.assertEqual(mail.outbox[0].to, ['buyer@bigcorp.com'])
        self.assertIn(invoice.number, mail.outbox[0].subject)
        self.assertEqual(self.client.post(f'/api/invoices/{invoice.pk}/actions/confirm/').status_code, 400)

    def test_cancel_frees_the_period_and_discount(self):
        discount = Discount.objects.create(name='Promo', value=Decimal('10'), start_date=self.today, usage_limit=1)
        subscription = self.make_subscription()
        invoice = self.invoice_for(subscription)

        self.client.post(f'/api/invoices/{invoice.pk}/actions/cancel/')
        subscription.refresh_from_db()
        discount.refresh_from_db()
        self.assertEqual(subscription.next_invoice_date, invoice.period_start)
        self.assertEqual(discount.used_count, 0)

        replacement = self.invoice_for(subscription)
        self.assertEqual(replacement.period_start, invoice.period_start)
        self.assertEqual(replacement.discount, discount)

    def test_bulk_confirm_drafts(self):
        for _ in range(3):
            self.invoice_for(self.make_subscription())
        response = self.client.post('/api/invoices/bulk-confirm/', {})
        self.assertEqual(response.data['confirmed'], 3)
        self.assertFalse(Invoice.objects.filter(state=Invoice.State.DRAFT).exists())

    def test_create_invoice_from_subscription_endpoint(self):
        subscription = self.make_subscription()
        detail = self.client.get(f'/api/subscriptions/{subscription.pk}/')
        self.assertTrue(detail.data['can_invoice'])
        response = self.client.post(f'/api/subscriptions/{subscription.pk}/invoice/')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.post(f'/api/subscriptions/{subscription.pk}/invoice/').status_code, 400)


class PaymentTests(BillingTestCase):
    def confirmed_invoice(self):
        invoice = self.invoice_for(self.make_subscription())
        return services.perform_invoice_action(invoice, 'confirm')

    def pay(self, invoice, amount, method='upi'):
        return self.client.post('/api/payments/', {'invoice': invoice.pk, 'method': method, 'amount': amount,
                                                   'note': 'UTR 1234'})

    def test_partial_then_full_payment_marks_paid(self):
        invoice = self.confirmed_invoice()
        self.assertEqual(self.pay(invoice, '5000.00').status_code, 201)
        invoice.refresh_from_db()
        self.assertEqual((invoice.state, invoice.amount_due), (Invoice.State.CONFIRMED, Decimal('4811.70')))

        response = self.pay(invoice, '4811.70', method='bank_transfer')
        self.assertEqual(response.data['recorded_by_name'], 'rep@brightloop.com')
        invoice.refresh_from_db()
        self.assertEqual((invoice.state, invoice.amount_due), (Invoice.State.PAID, Decimal('0')))
        self.assertEqual(self.client.post(f'/api/invoices/{invoice.pk}/actions/cancel/').status_code, 400)

    def test_rejects_overpayment_and_draft_invoices(self):
        invoice = self.confirmed_invoice()
        self.assertEqual(self.pay(invoice, '99999.00').status_code, 400)
        draft = self.invoice_for(self.make_subscription())
        self.assertEqual(self.pay(draft, '10.00').status_code, 400)
        self.assertEqual(self.pay(invoice, '0').status_code, 400)

    def test_deleting_payment_reopens_invoice(self):
        invoice = self.confirmed_invoice()
        payment_id = self.pay(invoice, str(invoice.amount_total)).data['id']
        self.assertEqual(self.client.delete(f'/api/payments/{payment_id}/').status_code, 204)
        invoice.refresh_from_db()
        self.assertEqual((invoice.state, invoice.amount_paid), (Invoice.State.CONFIRMED, Decimal('0')))

    def test_overdue_and_outstanding_filters(self):
        overdue = self.confirmed_invoice()
        Invoice.objects.filter(pk=overdue.pk).update(due_date=self.today - timedelta(days=1))
        self.confirmed_invoice()

        rows = self.client.get('/api/invoices/', {'overdue': 'true'}).data['results']
        self.assertEqual([row['id'] for row in rows], [overdue.pk])
        self.assertTrue(rows[0]['is_overdue'])
        self.assertEqual(len(self.client.get('/api/invoices/', {'state': 'confirmed'}).data['results']), 2)


class CustomerAccessTests(BillingTestCase):
    def test_customer_sees_only_own_issued_invoices(self):
        mine = services.perform_invoice_action(self.invoice_for(self.make_subscription()), 'confirm')
        self.invoice_for(self.make_subscription())
        theirs = services.perform_invoice_action(
            self.invoice_for(self.make_subscription(customer=self.other_customer)), 'confirm')
        services.record_payment(mine, Decimal('100'), Payment.Method.CASH, self.today)

        self.client.force_authenticate(self.customer)
        self.assertEqual([row['id'] for row in self.client.get('/api/invoices/').data['results']], [mine.pk])
        self.assertEqual(self.client.get(f'/api/invoices/{theirs.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/invoices/{mine.pk}/').data['available_actions'], [])
        self.assertEqual(len(self.client.get('/api/payments/').data['results']), 1)

    def test_customer_cannot_change_billing(self):
        invoice = services.perform_invoice_action(self.invoice_for(self.make_subscription()), 'confirm')
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.post(f'/api/invoices/{invoice.pk}/actions/cancel/').status_code, 403)
        self.assertEqual(self.client.post('/api/payments/', {'invoice': invoice.pk, 'method': 'upi',
                                                             'amount': '10'}).status_code, 403)
        self.assertEqual(self.client.post('/api/billing/run/').status_code, 403)
