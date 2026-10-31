from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from catalog.models import Discount, Product, money_field
from subscriptions.models import Subscription


class Invoice(models.Model):
    class State(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        CONFIRMED = 'confirmed', 'Confirmed'
        PAID = 'paid', 'Paid'
        CANCELLED = 'cancelled', 'Cancelled'

    number = models.CharField(max_length=30, unique=True, blank=True)
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name='invoices')
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='invoices')
    billing_name = models.CharField(max_length=255)
    billing_email = models.EmailField()
    billing_address = models.TextField(blank=True)
    state = models.CharField(max_length=10, choices=State.choices, default=State.DRAFT, db_index=True)
    invoice_date = models.DateField(db_index=True)
    due_date = models.DateField(db_index=True)
    period_start = models.DateField()
    period_end = models.DateField()
    discount = models.ForeignKey(Discount, on_delete=models.PROTECT, null=True, blank=True, related_name='invoices')
    amount_untaxed = money_field(default=Decimal('0'))
    amount_discount = money_field(default=Decimal('0'))
    amount_tax = money_field(default=Decimal('0'))
    amount_total = money_field(default=Decimal('0'))
    amount_paid = money_field(default=Decimal('0'))
    amount_due = money_field(default=Decimal('0'))
    confirmed_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-invoice_date', '-id']
        indexes = [models.Index(fields=['state', 'due_date']), models.Index(fields=['customer', 'state'])]
        constraints = [
            models.UniqueConstraint(fields=['subscription', 'period_start'], condition=~Q(state='cancelled'),
                                    name='one_live_invoice_per_period'),
        ]

    def __str__(self):
        return self.number

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.number:
            self.number = f'INV/{self.created_at.year}/{self.pk:05d}'
            super().save(update_fields=['number'])

    @property
    def is_overdue(self):
        return self.state == self.State.CONFIRMED and self.due_date < timezone.localdate()

    def recompute_totals(self):
        lines = list(self.lines.all())
        self.amount_untaxed = sum((line.subtotal for line in lines), Decimal('0'))
        self.amount_discount = sum((line.discount_amount for line in lines), Decimal('0'))
        self.amount_tax = sum((line.tax_amount for line in lines), Decimal('0'))
        self.amount_total = self.amount_untaxed + self.amount_tax
        self.amount_due = self.amount_total - self.amount_paid


class InvoiceLine(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='lines')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField()
    unit_price = money_field()
    discount_amount = money_field(default=Decimal('0'))
    subtotal = money_field()
    tax_label = models.CharField(max_length=255, blank=True)
    tax_amount = money_field(default=Decimal('0'))
    total = money_field()

    class Meta:
        ordering = ['id']


class Payment(models.Model):
    class Method(models.TextChoices):
        BANK_TRANSFER = 'bank_transfer', 'Bank transfer'
        UPI = 'upi', 'UPI'
        CARD = 'card', 'Card'
        CASH = 'cash', 'Cash'
        CHEQUE = 'cheque', 'Cheque'
        OTHER = 'other', 'Other'

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    method = models.CharField(max_length=20, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    payment_date = models.DateField(default=timezone.localdate, db_index=True)
    note = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date', '-id']
