from django.contrib import admin

from .models import QuotationTemplate, QuotationTemplateLine, Subscription, SubscriptionEvent, SubscriptionLine


class TemplateLineInline(admin.TabularInline):
    model = QuotationTemplateLine
    extra = 0


class SubscriptionLineInline(admin.TabularInline):
    model = SubscriptionLine
    extra = 0
    readonly_fields = ['subtotal', 'tax_amount', 'total']


class SubscriptionEventInline(admin.TabularInline):
    model = SubscriptionEvent
    extra = 0
    readonly_fields = ['action', 'from_state', 'to_state', 'user', 'note', 'created_at']
    can_delete = False


@admin.register(QuotationTemplate)
class QuotationTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'plan', 'plan_quantity', 'validity_days', 'is_active']
    inlines = [TemplateLineInline]


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['number', 'customer', 'plan', 'state', 'start_date', 'expiry_date', 'next_invoice_date',
                    'amount_total']
    list_filter = ['state', 'plan']
    search_fields = ['number', 'customer__email', 'customer__company_name']
    readonly_fields = ['number', 'amount_untaxed', 'amount_tax', 'amount_total', 'term_days']
    inlines = [SubscriptionLineInline, SubscriptionEventInline]
