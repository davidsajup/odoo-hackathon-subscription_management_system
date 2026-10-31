from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command

from accounts.models import User
from billing import services as billing_services
from billing.models import Invoice, Payment
from billing.tests import BillingTestCase
from catalog.models import Plan
from subscriptions.models import Subscription


class FinanceSummaryTests(BillingTestCase):
    def setUp(self):
        super().setUp()
        self.paid = billing_services.perform_invoice_action(self.invoice_for(self.make_subscription()), 'confirm')
        billing_services.record_payment(self.paid, self.paid.amount_total, Payment.Method.UPI, self.today)
        self.overdue = billing_services.perform_invoice_action(self.invoice_for(self.make_subscription()), 'confirm')
        Invoice.objects.filter(pk=self.overdue.pk).update(due_date=self.today - timedelta(days=5))
        self.invoice_for(self.make_subscription())
        self.make_subscription(state=Subscription.State.QUOTATION)

    def get_summary(self, **params):
        response = self.client.get('/api/reports/summary/', params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_summary_numbers(self):
        data = self.get_summary()
        self.assertEqual(data['subscriptions']['active'], 3)
        self.assertEqual(data['subscriptions']['by_state']['quotation'], 1)
        self.assertEqual(data['mrr'], '24945.00')
        self.assertEqual(data['invoiced'], {'total': '19623.40', 'untaxed': '16630.00', 'count': 2})
        self.assertEqual(data['collected'], {'total': '9811.70', 'count': 1})
        self.assertEqual(data['outstanding'], {'total': '9811.70', 'count': 1})
        self.assertEqual(data['overdue'], {'total': '9811.70', 'count': 1})
        self.assertEqual(data['draft_invoices'], 1)
        self.assertEqual(data['revenue_by_plan'], [{'plan': 'Pro Monthly', 'revenue': '16630.00', 'invoices': 2}])

    def test_mrr_normalises_yearly_plans(self):
        yearly = Plan.objects.create(name='Yearly', price=Decimal('12000'), billing_period='yearly',
                                     start_date=self.plan.start_date)
        Subscription.objects.filter(state=Subscription.State.ACTIVE).update(plan=yearly, amount_untaxed=Decimal('12000'))
        self.assertEqual(self.get_summary()['mrr'], '3000.00')

    def test_date_range_and_plan_filters(self):
        last_year = self.get_summary(date_from=str(self.today - timedelta(days=400)),
                                     date_to=str(self.today - timedelta(days=300)))
        self.assertEqual(last_year['invoiced']['count'], 0)
        self.assertEqual(last_year['collected']['count'], 0)

        other_plan = Plan.objects.create(name='Other', price=Decimal('1'), start_date=self.plan.start_date)
        filtered = self.get_summary(plan=other_plan.pk)
        self.assertEqual((filtered['subscriptions']['active'], filtered['invoiced']['count']), (0, 0))

        bad = self.client.get('/api/reports/summary/', {'date_from': str(self.today), 'date_to': '2000-01-01'})
        self.assertEqual(bad.status_code, 400)

    def test_revenue_trend_has_every_month(self):
        rows = self.client.get('/api/reports/revenue-trend/', {'months': 6}).data
        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[-1], {'month': self.today.strftime('%Y-%m'), 'invoiced': '19623.40',
                                    'collected': '9811.70'})
        self.assertEqual(rows[0]['invoiced'], '0.00')

    def test_only_staff_see_company_reports(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get('/api/reports/summary/').status_code, 403)
        self.assertEqual(self.client.get('/api/reports/revenue-trend/').status_code, 403)

    def test_customer_summary_is_their_own(self):
        self.client.force_authenticate(self.customer)
        data = self.client.get('/api/reports/my-summary/').data
        self.assertEqual(data['active_subscriptions'], 3)
        self.assertEqual(data['quotations_to_review'], 1)
        self.assertEqual(data['amount_due'], {'total': '9811.70', 'count': 1})
        self.assertEqual(data['overdue']['count'], 1)

        self.client.force_authenticate(self.other_customer)
        self.assertEqual(self.client.get('/api/reports/my-summary/').data['amount_due']['count'], 0)


class SeedDemoTests(BillingTestCase):
    def test_seed_creates_history_and_reset_only_removes_demo_data(self):
        mine = self.make_subscription()
        out = StringIO()
        call_command('seed_demo', '--subscriptions', '60', '--months', '3', stdout=out)
        self.assertIn('Created 12 customers, 60 subscriptions', out.getvalue())

        demo = Subscription.objects.filter(customer__email__startswith='demo-customer-')
        self.assertEqual(demo.count(), 60)
        self.assertTrue(Invoice.objects.filter(customer__email__startswith='demo-customer-').exists())
        self.assertFalse(demo.filter(state=Subscription.State.ACTIVE, next_invoice_date__lte=self.today).exists())
        self.assertEqual(len({s.number for s in Subscription.objects.all()}), Subscription.objects.count())

        call_command('seed_demo', '--subscriptions', '60', '--months', '3', '--reset', stdout=StringIO())
        self.assertEqual(demo.count(), 60)
        self.assertEqual(User.objects.filter(email__startswith='demo-customer-').count(), 12)
        self.assertTrue(Subscription.objects.filter(pk=mine.pk).exists())
