from django.db import transaction
from rest_framework import serializers

from accounts.models import User
from catalog.models import Plan, Product, ProductVariant
from catalog.serializers import TaxSerializer

from . import services
from .models import QuotationTemplate, QuotationTemplateLine, Subscription, SubscriptionEvent, SubscriptionLine


def check_variant(attrs):
    product, variant = attrs['product'], attrs.get('variant')
    if variant and variant.product_id != product.pk:
        raise serializers.ValidationError({'variant': 'This variant belongs to a different product.'})
    if not product.is_active or (variant and not variant.is_active):
        raise serializers.ValidationError({'product': f'{product.name} is archived and cannot be sold.'})
    return attrs


def check_plan_quantity(plan, quantity):
    if quantity < plan.min_quantity:
        raise serializers.ValidationError(
            {'plan_quantity': f'The {plan.name} plan needs a quantity of at least {plan.min_quantity}.'})


class TemplateLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    variant_name = serializers.CharField(source='variant.name', read_only=True, default='')

    class Meta:
        model = QuotationTemplateLine
        fields = ['id', 'product', 'product_name', 'variant', 'variant_name', 'quantity']

    def validate(self, attrs):
        return check_variant(attrs)


class QuotationTemplateSerializer(serializers.ModelSerializer):
    lines = TemplateLineSerializer(many=True)
    plan_name = serializers.CharField(source='plan.name', read_only=True)

    class Meta:
        model = QuotationTemplate
        fields = ['id', 'name', 'plan', 'plan_name', 'plan_quantity', 'validity_days', 'notes', 'lines', 'is_active']

    def validate(self, attrs):
        plan = attrs.get('plan', getattr(self.instance, 'plan', None))
        quantity = attrs.get('plan_quantity', getattr(self.instance, 'plan_quantity', 1))
        check_plan_quantity(plan, quantity)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop('lines')
        template = QuotationTemplate.objects.create(**validated_data)
        QuotationTemplateLine.objects.bulk_create(QuotationTemplateLine(template=template, **line) for line in lines)
        return template

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)
        if lines is not None:
            instance.lines.all().delete()
            QuotationTemplateLine.objects.bulk_create(QuotationTemplateLine(template=instance, **line) for line in lines)
        return instance


class SubscriptionLineSerializer(serializers.ModelSerializer):
    tax_details = TaxSerializer(source='taxes', many=True, read_only=True)

    class Meta:
        model = SubscriptionLine
        fields = ['id', 'line_type', 'product', 'variant', 'description', 'quantity', 'unit_price', 'tax_details',
                  'subtotal', 'tax_amount', 'total']


class ProductLineInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.all(), required=False,
                                                 allow_null=True)
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False,
                                          allow_null=True)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        return check_variant(attrs)


class SubscriptionEventSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionEvent
        fields = ['id', 'action', 'from_state', 'to_state', 'user_name', 'note', 'created_at']

    def get_user_name(self, event):
        if event.user is None:
            return 'System'
        return event.user.get_full_name() or event.user.email


class CustomerSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'company_name', 'phone', 'address']


class PlanSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ['id', 'name', 'price', 'billing_period', 'billing_interval', 'min_quantity', 'auto_close',
                  'closable', 'pausable', 'renewable']


class SubscriptionListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    plan_name = serializers.CharField(source='plan.name', read_only=True)

    class Meta:
        model = Subscription
        fields = ['id', 'number', 'customer', 'customer_name', 'plan', 'plan_name', 'state', 'start_date',
                  'expiry_date', 'next_invoice_date', 'amount_total', 'created_at']

    def get_customer_name(self, subscription):
        customer = subscription.customer
        return customer.company_name or customer.get_full_name() or customer.email


class SubscriptionSerializer(serializers.ModelSerializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=User.Role.CUSTOMER))
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.all())
    customer_detail = CustomerSummarySerializer(source='customer', read_only=True)
    plan_detail = PlanSummarySerializer(source='plan', read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True, default=None)
    lines = SubscriptionLineSerializer(many=True, read_only=True)
    events = SubscriptionEventSerializer(many=True, read_only=True)
    plan_quantity = serializers.IntegerField(min_value=1, required=False)
    product_lines = ProductLineInputSerializer(many=True, write_only=True, required=False)
    available_actions = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = ['id', 'number', 'customer', 'customer_detail', 'plan', 'plan_detail', 'template', 'template_name',
                  'state', 'start_date', 'expiry_date', 'next_invoice_date', 'payment_terms_days',
                  'quotation_valid_until', 'notes', 'amount_untaxed', 'amount_tax', 'amount_total', 'plan_quantity',
                  'lines', 'product_lines', 'events', 'available_actions', 'created_at']
        read_only_fields = ['number', 'template', 'state', 'next_invoice_date', 'amount_untaxed', 'amount_tax',
                            'amount_total', 'created_at']

    def get_available_actions(self, subscription):
        return services.available_actions(subscription, self.context['request'].user)

    def to_representation(self, subscription):
        data = super().to_representation(subscription)
        plan_line = next((line for line in subscription.lines.all()
                          if line.line_type == SubscriptionLine.LineType.PLAN), None)
        data['plan_quantity'] = plan_line.quantity if plan_line else None
        return data

    def validate(self, attrs):
        instance = self.instance
        if instance and not instance.is_editable:
            raise serializers.ValidationError('Only draft subscriptions and quotations can be edited.')

        def current(field):
            return attrs.get(field, getattr(instance, field, None))

        plan, start, expiry = current('plan'), current('start_date'), current('expiry_date')
        if expiry <= start:
            raise serializers.ValidationError({'expiry_date': 'Expiry date must be after the start date.'})
        if (instance is None or 'plan' in attrs or 'start_date' in attrs) and not plan.is_available_on(start):
            raise serializers.ValidationError({'plan': f'The {plan.name} plan is not available on {start}.'})
        if not current('customer').is_active:
            raise serializers.ValidationError({'customer': 'This customer account is deactivated.'})

        if instance is None:
            attrs.setdefault('plan_quantity', plan.min_quantity)
        if 'plan_quantity' in attrs:
            check_plan_quantity(plan, attrs['plan_quantity'])
        elif 'plan' in attrs:
            check_plan_quantity(plan, self._current_plan_quantity())
        return attrs

    def _current_plan_quantity(self):
        return self.instance.lines.filter(line_type=SubscriptionLine.LineType.PLAN).values_list(
            'quantity', flat=True).first() or 1

    def _current_product_lines(self):
        return [
            {'product': line.product, 'variant': line.variant, 'quantity': line.quantity,
             'unit_price': line.unit_price, 'description': line.description}
            for line in self.instance.lines.filter(line_type=SubscriptionLine.LineType.PRODUCT)
            .select_related('product', 'variant')
        ]

    @transaction.atomic
    def create(self, validated_data):
        plan_quantity = validated_data.pop('plan_quantity')
        product_lines = validated_data.pop('product_lines', [])
        request = self.context['request']
        subscription = Subscription.objects.create(created_by=request.user, **validated_data)
        services.replace_lines(subscription, plan_quantity, product_lines)
        SubscriptionEvent.objects.create(subscription=subscription, action='create', to_state=subscription.state,
                                         user=request.user)
        return subscription

    @transaction.atomic
    def update(self, instance, validated_data):
        plan_quantity = validated_data.pop('plan_quantity', None)
        product_lines = validated_data.pop('product_lines', None)
        rebuild = plan_quantity is not None or product_lines is not None or 'plan' in validated_data
        instance = super().update(instance, validated_data)
        if rebuild:
            services.replace_lines(
                instance,
                plan_quantity if plan_quantity is not None else self._current_plan_quantity(),
                product_lines if product_lines is not None else self._current_product_lines(),
            )
        return instance


class FromTemplateSerializer(serializers.Serializer):
    template = serializers.PrimaryKeyRelatedField(queryset=QuotationTemplate.objects.filter(is_active=True))
    customer = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.CUSTOMER, is_active=True))
    start_date = serializers.DateField()

    def validate(self, attrs):
        plan = attrs['template'].plan
        if not plan.is_available_on(attrs['start_date']):
            raise serializers.ValidationError({'start_date': f'The {plan.name} plan is not available on that date.'})
        return attrs
