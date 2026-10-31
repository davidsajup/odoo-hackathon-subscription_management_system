from decimal import ROUND_HALF_UP, Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

CENT = Decimal('0.01')
NON_NEGATIVE = [MinValueValidator(Decimal('0'))]


def money_field(**kwargs):
    return models.DecimalField(max_digits=12, decimal_places=2, validators=NON_NEGATIVE, **kwargs)


def round_money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


class Tax(models.Model):
    class TaxType(models.TextChoices):
        PERCENT = 'percent', 'Percentage'
        FIXED = 'fixed', 'Fixed amount per unit'

    name = models.CharField(max_length=100, unique=True)
    tax_type = models.CharField(max_length=10, choices=TaxType.choices, default=TaxType.PERCENT)
    amount = money_field()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'taxes'

    def __str__(self):
        return self.name

    def compute(self, base_amount, quantity=1):
        if self.tax_type == self.TaxType.PERCENT:
            return round_money(Decimal(base_amount) * self.amount / 100)
        return round_money(self.amount * quantity)


class Product(models.Model):
    class ProductType(models.TextChoices):
        SERVICE = 'service', 'Service'
        ADDON = 'addon', 'Add-on'
        GOODS = 'goods', 'Goods'

    name = models.CharField(max_length=200)
    product_type = models.CharField(max_length=10, choices=ProductType.choices, default=ProductType.SERVICE)
    sales_price = money_field()
    cost_price = money_field(default=Decimal('0'))
    notes = models.TextField(blank=True)
    taxes = models.ManyToManyField(Tax, blank=True, related_name='products')
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductAttribute(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class AttributeValue(models.Model):
    attribute = models.ForeignKey(ProductAttribute, on_delete=models.CASCADE, related_name='values')
    name = models.CharField(max_length=100)
    extra_price = money_field(default=Decimal('0'))

    class Meta:
        ordering = ['attribute__name', 'name']
        constraints = [models.UniqueConstraint(fields=['attribute', 'name'], name='unique_attribute_value')]

    def __str__(self):
        return f'{self.attribute.name}: {self.name}'


class ProductVariant(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    values = models.ManyToManyField(AttributeValue, related_name='variants')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.product.name} ({self.name})'

    @property
    def name(self):
        return ', '.join(str(value) for value in self.values.all())

    @property
    def extra_price(self):
        return sum((value.extra_price for value in self.values.all()), Decimal('0'))

    @property
    def price(self):
        return self.product.sales_price + self.extra_price


class Plan(models.Model):
    class BillingPeriod(models.TextChoices):
        DAILY = 'daily', 'Daily'
        WEEKLY = 'weekly', 'Weekly'
        MONTHLY = 'monthly', 'Monthly'
        YEARLY = 'yearly', 'Yearly'

    name = models.CharField(max_length=200)
    price = money_field()
    billing_period = models.CharField(max_length=10, choices=BillingPeriod.choices, default=BillingPeriod.MONTHLY)
    billing_interval = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    min_quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    auto_close = models.BooleanField(default=False)
    closable = models.BooleanField(default=True)
    pausable = models.BooleanField(default=False)
    renewable = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def is_available_on(self, day):
        return self.is_active and self.start_date <= day and (self.end_date is None or day <= self.end_date)


class Discount(models.Model):
    class DiscountType(models.TextChoices):
        PERCENT = 'percent', 'Percentage'
        FIXED = 'fixed', 'Fixed amount'

    class Scope(models.TextChoices):
        SUBSCRIPTION = 'subscription', 'Whole subscription'
        PRODUCTS = 'products', 'Specific products'

    name = models.CharField(max_length=200)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.PERCENT)
    value = money_field()
    min_purchase_amount = money_field(default=Decimal('0'))
    min_quantity = models.PositiveIntegerField(default=0)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    used_count = models.PositiveIntegerField(default=0)
    scope = models.CharField(max_length=15, choices=Scope.choices, default=Scope.SUBSCRIPTION)
    products = models.ManyToManyField(Product, blank=True, related_name='discounts')
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ['-start_date', 'name']

    def __str__(self):
        return self.name

    @property
    def remaining_uses(self):
        return None if self.usage_limit is None else max(self.usage_limit - self.used_count, 0)

    def is_usable_on(self, day):
        return (
            self.is_active
            and self.start_date <= day
            and (self.end_date is None or day <= self.end_date)
            and self.remaining_uses != 0
        )
