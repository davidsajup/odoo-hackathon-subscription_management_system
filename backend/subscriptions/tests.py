from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import AttributeValue, Plan, Product, ProductAttribute, ProductVariant, Tax

from .models import QuotationTemplate, QuotationTemplateLine, Subscription

PASSWORD = 'Brightloop#2026'


class SubscriptionTestCase(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.admin = User.objects.create_superuser('admin@brightloop.com', PASSWORD)
        self.staff = User.objects.create_user('rep@brightloop.com', PASSWORD, role=User.Role.STAFF)
        self.customer = User.objects.create_user('buyer@bigcorp.com', PASSWORD, company_name='Big Corp')
        self.other_customer = User.objects.create_user('other@shop.com', PASSWORD)

        self.gst = Tax.objects.create(name='GST 18%', amount=Decimal('18'))
        self.plan = Plan.objects.create(name='Pro Monthly', price=Decimal('999'), min_quantity=5,
                                        start_date=self.today - timedelta(days=30), pausable=True)
        self.plan.taxes.set([self.gst])
        self.crm = Product.objects.create(name='Brightloop CRM', sales_price=Decimal('1000'))
        self.crm.taxes.set([self.gst])
        brand = ProductAttribute.objects.create(name='Brand')
        odoo = AttributeValue.objects.create(attribute=brand, name='Odoo', extra_price=Decimal('560'))
        self.odoo_crm = ProductVariant.objects.create(product=self.crm)
        self.odoo_crm.values.set([odoo])
        self.backup = Product.objects.create(name='Backup add-on', product_type='addon', sales_price=Decimal('200'))
        self.backup.taxes.set([self.gst])
        self.client.force_authenticate(self.staff)

    def payload(self, **overrides):
        data = {
            'customer': self.customer.pk, 'plan': self.plan.pk, 'plan_quantity': 5,
            'start_date': str(self.today), 'expiry_date': str(self.today + timedelta(days=365)),
            'payment_terms_days': 30,
            'product_lines': [
                {'product': self.crm.pk, 'variant': self.odoo_crm.pk, 'quantity': 2},
                {'product': self.backup.pk, 'quantity': 1},
            ],
        }
        data.update(overrides)
        return data

    def create_subscription(self, **overrides):
        response = self.client.post('/api/subscriptions/', self.payload(**overrides))
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def act(self, subscription_id, name):
        return self.client.post(f'/api/subscriptions/{subscription_id}/actions/{name}/')


class CreateSubscriptionTests(SubscriptionTestCase):
    def test_builds_plan_and_product_lines_with_taxes(self):
        data = self.create_subscription()
        self.assertEqual(data['state'], 'draft')
        self.assertRegex(data['number'], r'^SUB/\d{4}/\d{5}$')
        self.assertEqual(data['plan_quantity'], 5)

        lines = [(line['line_type'], line['description'], line['quantity'], line['unit_price'], line['total'])
                 for line in data['lines']]
        self.assertEqual(lines, [
            ('plan', 'Pro Monthly', 5, '999.00', '5894.10'),
            ('product', 'Brightloop CRM – Brand: Odoo', 2, '1560.00', '3681.60'),
            ('product', 'Backup add-on', 1, '200.00', '236.00'),
        ])
        self.assertEqual((data['amount_untaxed'], data['amount_tax'], data['amount_total']),
                         ('8315.00', '1496.70', '9811.70'))
        self.assertEqual(data['events'][0]['action'], 'create')

    def test_validation_rules(self):
        cases = {
            'plan_quantity': self.payload(plan_quantity=4),
            'expiry_date': self.payload(expiry_date=str(self.today)),
            'plan': self.payload(start_date=str(self.today - timedelta(days=60))),
            'customer': self.payload(customer=self.staff.pk),
            'product_lines': self.payload(product_lines=[
                {'product': self.backup.pk, 'variant': self.odoo_crm.pk, 'quantity': 1}]),
        }
        for field, payload in cases.items():
            with self.subTest(field=field):
                response = self.client.post('/api/subscriptions/', payload)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_default_plan_quantity_is_plan_minimum(self):
        payload = self.payload(product_lines=[])
        del payload['plan_quantity']
        response = self.client.post('/api/subscriptions/', payload)
        self.assertEqual(response.data['plan_quantity'], 5)

    def test_unit_price_can_be_negotiated(self):
        data = self.create_subscription(product_lines=[{'product': self.backup.pk, 'quantity': 1,
                                                         'unit_price': '150.00'}])
        self.assertEqual(data['lines'][1]['unit_price'], '150.00')

    def test_edit_recalculates_and_keeps_existing_lines(self):
        data = self.create_subscription()
        response = self.client.patch(f'/api/subscriptions/{data["id"]}/', {'plan_quantity': 10})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['lines']), 3)
        self.assertEqual(response.data['lines'][0]['total'], '11788.20')

    def test_from_template(self):
        template = QuotationTemplate.objects.create(name='Big Corp bundle', plan=self.plan, plan_quantity=20,
                                                    validity_days=15)
        QuotationTemplateLine.objects.create(template=template, product=self.crm, variant=self.odoo_crm, quantity=20)
        response = self.client.post('/api/subscriptions/from-template/', {
            'template': template.pk, 'customer': self.customer.pk, 'start_date': str(self.today)})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['plan_quantity'], 20)
        self.assertEqual(response.data['lines'][1]['unit_price'], '1560.00')
        self.assertEqual(response.data['quotation_valid_until'], str(self.today + timedelta(days=15)))
        self.assertEqual(response.data['template_name'], 'Big Corp bundle')


class LifecycleTests(SubscriptionTestCase):
    def test_full_lifecycle(self):
        sub_id = self.create_subscription(start_date=str(self.today - timedelta(days=3)))['id']
        for name, state in [('send_quotation', 'quotation'), ('confirm', 'confirmed'), ('activate', 'active'),
                            ('close', 'closed')]:
            response = self.act(sub_id, name)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['state'], state)
            if name == 'activate':
                self.assertEqual(response.data['next_invoice_date'], str(self.today - timedelta(days=3)))
            if name == 'send_quotation':
                self.assertEqual(response.data['quotation_valid_until'], str(self.today + timedelta(days=30)))
        self.assertEqual(len(response.data['events']), 5)
        self.assertIsNone(response.data['next_invoice_date'])

    def test_illegal_transition_is_rejected(self):
        sub_id = self.create_subscription()['id']
        response = self.act(sub_id, 'activate')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Subscription.objects.get(pk=sub_id).state, 'draft')
        self.assertEqual(self.act(sub_id, 'teleport').status_code, 400)

    def activate(self, **plan_flags):
        Plan.objects.filter(pk=self.plan.pk).update(**plan_flags)
        sub_id = self.create_subscription()['id']
        for name in ('confirm', 'activate'):
            self.act(sub_id, name)
        return sub_id

    def test_plan_rules_control_pause_and_close(self):
        sub_id = self.activate(pausable=False, closable=False)
        self.assertEqual(self.act(sub_id, 'pause').status_code, 400)
        self.assertEqual(self.act(sub_id, 'close').status_code, 400)
        response = self.client.get(f'/api/subscriptions/{sub_id}/')
        self.assertEqual(response.data['available_actions'], ['renew'])

    def test_pause_and_resume(self):
        sub_id = self.activate()
        self.assertEqual(self.act(sub_id, 'pause').data['state'], 'paused')
        self.assertEqual(self.act(sub_id, 'resume').data['state'], 'active')

    def test_renew_extends_by_original_term_each_time(self):
        sub_id = self.activate()
        expiry = self.today + timedelta(days=365)
        self.assertEqual(self.act(sub_id, 'renew').data['expiry_date'], str(expiry + timedelta(days=365)))
        self.assertEqual(self.act(sub_id, 'renew').data['expiry_date'], str(expiry + timedelta(days=730)))

    def test_cannot_edit_after_confirmation(self):
        sub_id = self.create_subscription()['id']
        self.act(sub_id, 'confirm')
        response = self.client.patch(f'/api/subscriptions/{sub_id}/', {'plan_quantity': 10})
        self.assertEqual(response.status_code, 400)

    def test_expired_quotation_cannot_be_confirmed(self):
        sub_id = self.create_subscription()['id']
        self.act(sub_id, 'send_quotation')
        Subscription.objects.filter(pk=sub_id).update(quotation_valid_until=self.today - timedelta(days=1))
        self.assertEqual(self.act(sub_id, 'confirm').status_code, 400)

    def test_only_drafts_can_be_deleted(self):
        draft_id = self.create_subscription()['id']
        sent_id = self.create_subscription()['id']
        self.act(sent_id, 'send_quotation')
        self.assertEqual(self.client.delete(f'/api/subscriptions/{draft_id}/').status_code, 204)
        self.assertEqual(self.client.delete(f'/api/subscriptions/{sent_id}/').status_code, 400)


class CustomerPortalTests(SubscriptionTestCase):
    def test_customer_sees_only_own_non_draft_subscriptions(self):
        draft_id = self.create_subscription()['id']
        sent_id = self.create_subscription()['id']
        self.act(sent_id, 'send_quotation')
        self.create_subscription(customer=self.other_customer.pk)

        self.client.force_authenticate(self.customer)
        listing = self.client.get('/api/subscriptions/')
        self.assertEqual([row['id'] for row in listing.data['results']], [sent_id])
        self.assertEqual(self.client.get(f'/api/subscriptions/{draft_id}/').status_code, 404)

    def test_customer_accepts_quotation_but_cannot_activate(self):
        sub_id = self.create_subscription()['id']
        self.act(sub_id, 'send_quotation')

        self.client.force_authenticate(self.customer)
        detail = self.client.get(f'/api/subscriptions/{sub_id}/')
        self.assertEqual(detail.data['available_actions'], ['confirm', 'close'])
        self.assertEqual(self.act(sub_id, 'confirm').data['state'], 'confirmed')
        self.assertEqual(self.act(sub_id, 'activate').status_code, 400)

    def test_customer_cannot_create_or_edit(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.post('/api/subscriptions/', self.payload()).status_code, 403)

    def test_customer_pauses_own_active_subscription(self):
        sub_id = self.create_subscription()['id']
        for name in ('confirm', 'activate'):
            self.act(sub_id, name)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.act(sub_id, 'pause').data['state'], 'paused')
        self.client.force_authenticate(self.other_customer)
        self.assertEqual(self.act(sub_id, 'resume').status_code, 404)


class TemplateTests(SubscriptionTestCase):
    def test_admin_creates_template_staff_reads(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/quotation-templates/', {
            'name': 'Starter', 'plan': self.plan.pk, 'plan_quantity': 5, 'validity_days': 30,
            'lines': [{'product': self.crm.pk, 'variant': self.odoo_crm.pk, 'quantity': 5}]})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['lines'][0]['variant_name'], 'Brand: Odoo')

        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get('/api/quotation-templates/').status_code, 200)
        self.assertEqual(self.client.post('/api/quotation-templates/', {}).status_code, 403)

    def test_template_respects_plan_minimum(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/quotation-templates/', {
            'name': 'Too small', 'plan': self.plan.pk, 'plan_quantity': 2, 'lines': []})
        self.assertEqual(response.status_code, 400)
        self.assertIn('plan_quantity', response.data)
