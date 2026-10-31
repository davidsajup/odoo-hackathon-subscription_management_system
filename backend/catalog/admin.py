from django.contrib import admin

from .models import AttributeValue, Discount, Plan, Product, ProductAttribute, ProductVariant, Tax


class AttributeValueInline(admin.TabularInline):
    model = AttributeValue
    extra = 1


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    filter_horizontal = ['values']


@admin.register(Tax)
class TaxAdmin(admin.ModelAdmin):
    list_display = ['name', 'tax_type', 'amount', 'is_active']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'product_type', 'sales_price', 'cost_price', 'is_active']
    list_filter = ['product_type', 'is_active']
    search_fields = ['name']
    filter_horizontal = ['taxes']
    inlines = [ProductVariantInline]


@admin.register(ProductAttribute)
class ProductAttributeAdmin(admin.ModelAdmin):
    inlines = [AttributeValueInline]


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['name', 'price', 'billing_period', 'billing_interval', 'min_quantity', 'start_date', 'end_date',
                    'is_active']
    list_filter = ['billing_period', 'is_active']


@admin.register(Discount)
class DiscountAdmin(admin.ModelAdmin):
    list_display = ['name', 'discount_type', 'value', 'scope', 'start_date', 'end_date', 'usage_limit',
                    'used_count', 'is_active']
    list_filter = ['discount_type', 'scope', 'is_active']
    filter_horizontal = ['products']
