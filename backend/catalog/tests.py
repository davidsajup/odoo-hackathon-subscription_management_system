from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APITestCase

from accounts.models import User

from .models import AttributeValue, Discount, Plan, Product, ProductAttribute, ProductVariant, Tax

PASSWORD = 'Brightloop#2026'


class CatalogTestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin@brightloop.com', PASSWORD)
        self.staff = User.objects.create_user('staff@brightloop.com', PASSWORD, role=User.Role.STAFF)
        self.customer = User.objects.create_user('client@shop.com', PASSWORD)
        self.client.force_authenticate(self.admin)


class PermissionTests(CatalogTestCase):
    endpoints = ['taxes', 'products', 'attributes', 'variants', 'plans', 'discounts']

    def test_staff_can_read_but_not_write(self):
        self.client.force_authenticate(self.staff)
        for name in self.endpoints:
            with self.subTest(endpoint=name):
                self.assertEqual(self.client.get(f'/api/catalog/{name}/').status_code, 200)
        response = self.client.post('/api/catalog/taxes/', {'name': 'GST', 'amount': '18'})
        self.assertEqual(response.status_code, 403)
        response = self.client.post('/api/catalog/discounts/', {'name': 'Seats', 'value': '10'})
        self.assertEqual(response.status_code, 403)

    def test_customers_cannot_see_catalog_admin(self):
        self.client.force_authenticate(self.customer)
        for name in self.endpoints:
            with self.subTest(endpoint=name):
                self.assertEqual(self.client.get(f'/api/catalog/{name}/').status_code, 403)


class ProductAndVariantTests(CatalogTestCase):
    def setUp(self):
        super().setUp()
        self.gst = Tax.objects.create(name='GST 18%', amount=Decimal('18'))
        self.brand = ProductAttribute.objects.create(name='Brand')
        self.odoo = AttributeValue.objects.create(attribute=self.brand, name='Odoo', extra_price=Decimal('560'))
        self.generic = AttributeValue.objects.create(attribute=self.brand, name='Generic')
        self.edition = ProductAttribute.objects.create(name='Edition')
        self.enterprise = AttributeValue.objects.create(attribute=self.edition, name='Enterprise',
                                                        extra_price=Decimal('100'))

    def create_product(self):
        response = self.client.post('/api/catalog/products/', {
            'name': 'Brightloop CRM', 'product_type': 'service', 'sales_price': '1000.00',
            'cost_price': '400.00', 'notes': 'Core CRM seat', 'taxes': [self.gst.pk],
        })
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def test_admin_creates_product_with_all_fields(self):
        product = Product.objects.get(pk=self.create_product())
        self.assertEqual(product.cost_price, Decimal('400.00'))
        self.assertEqual(product.notes, 'Core CRM seat')
        self.assertEqual(list(product.taxes.all()), [self.gst])

    def test_odoo_brand_adds_560_to_price(self):
        product_id = self.create_product()
        response = self.client.post('/api/catalog/variants/', {'product': product_id, 'values': [self.odoo.pk]})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['price'], '1560.00')
        self.assertEqual(response.data['name'], 'Brand: Odoo')

        combined = self.client.post('/api/catalog/variants/', {
            'product': product_id, 'values': [self.odoo.pk, self.enterprise.pk]})
        self.assertEqual(combined.data['price'], '1660.00')

    def test_variant_rejects_two_values_of_one_attribute(self):
        product_id = self.create_product()
        response = self.client.post('/api/catalog/variants/', {
            'product': product_id, 'values': [self.odoo.pk, self.generic.pk]})
        self.assertEqual(response.status_code, 400)

    def test_variant_rejects_duplicate_combination(self):
        product_id = self.create_product()
        self.client.post('/api/catalog/variants/', {'product': product_id, 'values': [self.odoo.pk]})
        response = self.client.post('/api/catalog/variants/', {'product': product_id, 'values': [self.odoo.pk]})
        self.assertEqual(response.status_code, 400)

    def test_product_list_includes_variants(self):
        product_id = self.create_product()
        ProductVariant.objects.create(product_id=product_id).values.set([self.odoo])
        row = self.client.get('/api/catalog/products/').data['results'][0]
        self.assertEqual(row['variants'][0]['price'], '1560.00')
        self.assertEqual(row['tax_details'][0]['name'], 'GST 18%')

    def test_tax_compute(self):
        self.assertEqual(self.gst.compute(Decimal('1560')), Decimal('280.80'))
        fixed = Tax(name='Cess', tax_type=Tax.TaxType.FIXED, amount=Decimal('5'))
        self.assertEqual(fixed.compute(Decimal('1000'), quantity=3), Decimal('15.00'))


class AttributeTests(CatalogTestCase):
    def test_create_and_edit_attribute_with_values(self):
        response = self.client.post('/api/catalog/attributes/', {
            'name': 'Brand', 'values': [{'name': 'Odoo', 'extra_price': '560'}, {'name': 'Generic'}]})
        self.assertEqual(response.status_code, 201, response.data)
        attribute_id = response.data['id']
        odoo = next(value for value in response.data['values'] if value['name'] == 'Odoo')

        response = self.client.patch(f'/api/catalog/attributes/{attribute_id}/', {
            'values': [{'id': odoo['id'], 'name': 'Odoo', 'extra_price': '600'}, {'name': 'Acme'}]})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(sorted(AttributeValue.objects.values_list('name', flat=True)), ['Acme', 'Odoo'])
        self.assertEqual(AttributeValue.objects.get(name='Odoo').extra_price, Decimal('600'))

    def test_cannot_remove_value_used_by_variant(self):
        brand = ProductAttribute.objects.create(name='Brand')
        odoo = AttributeValue.objects.create(attribute=brand, name='Odoo', extra_price=560)
        product = Product.objects.create(name='CRM', sales_price=1000)
        ProductVariant.objects.create(product=product).values.set([odoo])

        response = self.client.patch(f'/api/catalog/attributes/{brand.pk}/', {'values': []})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(AttributeValue.objects.filter(pk=odoo.pk).exists())

    def test_rejects_duplicate_value_names(self):
        response = self.client.post('/api/catalog/attributes/', {
            'name': 'Brand', 'values': [{'name': 'Odoo'}, {'name': 'odoo'}]})
        self.assertEqual(response.status_code, 400)


class PlanTests(CatalogTestCase):
    def payload(self, **overrides):
        data = {'name': 'Pro Monthly', 'price': '999.00', 'billing_period': 'monthly', 'min_quantity': 5,
                'start_date': '2026-11-01', 'end_date': '2027-10-31', 'auto_close': True, 'pausable': True}
        data.update(overrides)
        return data

    def test_create_plan_with_options(self):
        response = self.client.post('/api/catalog/plans/', self.payload())
        self.assertEqual(response.status_code, 201, response.data)
        plan = Plan.objects.get()
        self.assertTrue(plan.auto_close and plan.pausable and plan.closable and plan.renewable)
        self.assertEqual(plan.min_quantity, 5)

    def test_rejects_end_before_start_and_bad_period(self):
        bad_dates = self.client.post('/api/catalog/plans/', self.payload(end_date='2026-10-01'))
        self.assertEqual(bad_dates.status_code, 400)
        self.assertIn('end_date', bad_dates.data)
        bad_period = self.client.post('/api/catalog/plans/', self.payload(billing_period='hourly'))
        self.assertEqual(bad_period.status_code, 400)

    def test_availability_window(self):
        plan = Plan(name='Launch', price=1, start_date=date(2026, 11, 1), end_date=date(2026, 11, 30))
        self.assertFalse(plan.is_available_on(date(2026, 10, 31)))
        self.assertTrue(plan.is_available_on(date(2026, 11, 15)))
        self.assertFalse(plan.is_available_on(date(2026, 12, 1)))


class DiscountTests(CatalogTestCase):
    def test_admin_creates_product_discount(self):
        product = Product.objects.create(name='Seats', sales_price=Decimal('100'))
        response = self.client.post('/api/catalog/discounts/', {
            'name': 'Bulk seats', 'discount_type': 'percent', 'value': '10', 'min_quantity': 20,
            'usage_limit': 50, 'scope': 'products', 'products': [product.pk], 'start_date': '2026-11-01'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['product_names'], ['Seats'])
        self.assertEqual(response.data['remaining_uses'], 50)

    def test_rejects_invalid_discounts(self):
        cases = [
            {'discount_type': 'percent', 'value': '120'},
            {'value': '0'},
            {'scope': 'products'},
            {'start_date': '2026-11-10', 'end_date': '2026-11-01'},
        ]
        for case in cases:
            with self.subTest(case=case):
                data = {'name': 'Bad', 'discount_type': 'fixed', 'value': '50', 'scope': 'subscription'}
                data.update(case)
                self.assertEqual(self.client.post('/api/catalog/discounts/', data).status_code, 400)

    def test_used_count_cannot_be_set_by_client(self):
        response = self.client.post('/api/catalog/discounts/', {'name': 'Promo', 'value': '5', 'used_count': 99})
        self.assertEqual(response.data['used_count'], 0)

    def test_usable_window_and_usage_limit(self):
        today = date(2026, 11, 15)
        discount = Discount(name='Promo', value=5, start_date=today - timedelta(days=5),
                            end_date=today + timedelta(days=5), usage_limit=2, used_count=1)
        self.assertTrue(discount.is_usable_on(today))
        discount.used_count = 2
        self.assertFalse(discount.is_usable_on(today))
        discount.used_count = 0
        self.assertFalse(discount.is_usable_on(today + timedelta(days=6)))
