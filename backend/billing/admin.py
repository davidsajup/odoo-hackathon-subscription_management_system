from django.contrib import admin

from .models import Invoice, InvoiceLine, Payment


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0
    can_delete = False
    readonly_fields = ['description', 'quantity', 'unit_price', 'discount_amount', 'subtotal', 'tax_label',
                       'tax_amount', 'total']


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ['method', 'amount', 'payment_date', 'note', 'recorded_by']
    can_delete = False


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['number', 'billing_name', 'state', 'invoice_date', 'due_date', 'amount_total', 'amount_due']
    list_filter = ['state']
    search_fields = ['number', 'billing_name', 'billing_email']
    readonly_fields = [field.name for field in Invoice._meta.fields]
    inlines = [InvoiceLineInline, PaymentInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['invoice', 'method', 'amount', 'payment_date', 'recorded_by']
    list_filter = ['method']
    readonly_fields = ['invoice', 'method', 'amount', 'payment_date', 'note', 'recorded_by', 'created_at']
