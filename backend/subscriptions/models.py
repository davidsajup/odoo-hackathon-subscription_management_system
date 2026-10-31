from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from catalog.models import Plan, Product, ProductVariant, Tax, money_field, round_money


class QuotationTemplate(models.Model):
    name = models.CharField(max_length=200)
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='templates')
    plan_quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    validity_days = models.PositiveIntegerField(default=30, validators=[MinValueValidator(1)])
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class QuotationTemplateLine(models.Model):
    template = models.ForeignKey(QuotationTemplate, on_delete=models.CASCADE, related_name='lines')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])

    class Meta:
        ordering = ['id']


class Subscription(models.Model):
    class State(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        QUOTATION = 'quotation', 'Quotation'
        CONFIRMED = 'confirmed', 'Confirmed'
        ACTIVE = 'active', 'Active'
        PAUSED = 'paused', 'Paused'
        CLOSED = 'closed', 'Closed'

    number = models.CharField(max_length=30, unique=True, blank=True)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='subscriptions')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='subscriptions')
    template = models.ForeignKey(QuotationTemplate, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='subscriptions')
    state = models.CharField(max_length=10, choices=State.choices, default=State.DRAFT, db_index=True)
    start_date = models.DateField()
    expiry_date = models.DateField()
    term_days = models.PositiveIntegerField(default=0)
    next_invoice_date = models.DateField(null=True, blank=True, db_index=True)
    payment_terms_days = models.PositiveIntegerField(default=15)
    quotation_valid_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    amount_untaxed = money_field(default=Decimal('0'))
    amount_tax = money_field(default=Decimal('0'))
    amount_total = money_field(default=Decimal('0'))
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['customer', 'state'])]

    def __str__(self):
        return self.number

    def save(self, *args, **kwargs):
        if self.is_editable:
            self.term_days = (self.expiry_date - self.start_date).days
        super().save(*args, **kwargs)
        if not self.number:
            self.number = f'SUB/{self.created_at.year}/{self.pk:05d}'
            super().save(update_fields=['number'])

    @property
    def is_editable(self):
        return self.state in (self.State.DRAFT, self.State.QUOTATION)

    def recompute_totals(self):
        lines = list(self.lines.prefetch_related('taxes'))
        for line in lines:
            line.compute_amounts()
            line.save(update_fields=['subtotal', 'tax_amount', 'total'])
        self.amount_untaxed = sum((line.subtotal for line in lines), Decimal('0'))
        self.amount_tax = sum((line.tax_amount for line in lines), Decimal('0'))
        self.amount_total = self.amount_untaxed + self.amount_tax
        self.save(update_fields=['amount_untaxed', 'amount_tax', 'amount_total', 'updated_at'])


class SubscriptionLine(models.Model):
    class LineType(models.TextChoices):
        PLAN = 'plan', 'Plan'
        PRODUCT = 'product', 'Product'

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name='lines')
    line_type = models.CharField(max_length=10, choices=LineType.choices, default=LineType.PRODUCT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, null=True, blank=True)
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, null=True, blank=True)
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    unit_price = money_field()
    taxes = models.ManyToManyField(Tax, blank=True)
    subtotal = money_field(default=Decimal('0'))
    tax_amount = money_field(default=Decimal('0'))
    total = money_field(default=Decimal('0'))

    class Meta:
        ordering = ['line_type', 'id']

    def compute_amounts(self):
        self.subtotal = round_money(self.unit_price * self.quantity)
        self.tax_amount = sum((tax.compute(self.subtotal, self.quantity) for tax in self.taxes.all()), Decimal('0'))
        self.total = self.subtotal + self.tax_amount


class SubscriptionEvent(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name='events')
    action = models.CharField(max_length=30)
    from_state = models.CharField(max_length=10, blank=True)
    to_state = models.CharField(max_length=10)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                             related_name='+')
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
