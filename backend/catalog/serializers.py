from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import AttributeValue, Discount, Plan, Product, ProductAttribute, ProductVariant, Tax


def check_date_range(attrs, instance):
    start = attrs.get('start_date', getattr(instance, 'start_date', None))
    end = attrs.get('end_date', getattr(instance, 'end_date', None))
    if start and end and end < start:
        raise serializers.ValidationError({'end_date': 'End date cannot be before the start date.'})


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ['id', 'name', 'tax_type', 'amount', 'is_active']

    def validate(self, attrs):
        tax_type = attrs.get('tax_type', getattr(self.instance, 'tax_type', None))
        amount = attrs.get('amount', getattr(self.instance, 'amount', None))
        if tax_type == Tax.TaxType.PERCENT and amount is not None and amount > 100:
            raise serializers.ValidationError({'amount': 'A percentage tax cannot exceed 100.'})
        return attrs


class AttributeValueSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    attribute_name = serializers.CharField(source='attribute.name', read_only=True)

    class Meta:
        model = AttributeValue
        fields = ['id', 'attribute_name', 'name', 'extra_price']


class ProductAttributeSerializer(serializers.ModelSerializer):
    values = AttributeValueSerializer(many=True)

    class Meta:
        model = ProductAttribute
        fields = ['id', 'name', 'values']

    def validate_values(self, values):
        names = [value['name'].strip().lower() for value in values]
        if len(names) != len(set(names)):
            raise serializers.ValidationError('Each value name must be unique within the attribute.')
        return values

    @transaction.atomic
    def create(self, validated_data):
        values = validated_data.pop('values')
        attribute = ProductAttribute.objects.create(**validated_data)
        for value in values:
            value.pop('id', None)
            AttributeValue.objects.create(attribute=attribute, **value)
        return attribute

    @transaction.atomic
    def update(self, instance, validated_data):
        values = validated_data.pop('values', None)
        instance.name = validated_data.get('name', instance.name)
        instance.save()
        if values is None:
            return instance

        existing = {value.pk: value for value in instance.values.all()}
        kept_ids = {value['id'] for value in values if value.get('id') in existing}
        removed = [value for pk, value in existing.items() if pk not in kept_ids]
        in_use = [value.name for value in removed if value.variants.exists()]
        if in_use:
            raise serializers.ValidationError(
                {'values': f'Used by product variants, cannot remove: {", ".join(in_use)}.'})
        AttributeValue.objects.filter(pk__in=[value.pk for value in removed]).delete()

        for data in values:
            value = existing.get(data.pop('id', None))
            if value is None:
                AttributeValue.objects.create(attribute=instance, **data)
            else:
                value.name, value.extra_price = data['name'], data.get('extra_price', value.extra_price)
                value.save()
        return instance


class ProductVariantSerializer(serializers.ModelSerializer):
    value_details = AttributeValueSerializer(source='values', many=True, read_only=True)
    name = serializers.CharField(read_only=True)
    extra_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ProductVariant
        fields = ['id', 'product', 'values', 'value_details', 'name', 'extra_price', 'price', 'is_active']

    def validate(self, attrs):
        product = attrs.get('product', getattr(self.instance, 'product', None))
        values = attrs.get('values', list(self.instance.values.all()) if self.instance else [])
        if not values:
            raise serializers.ValidationError({'values': 'Pick at least one attribute value.'})

        attribute_ids = [value.attribute_id for value in values]
        if len(attribute_ids) != len(set(attribute_ids)):
            raise serializers.ValidationError({'values': 'Pick only one value per attribute.'})

        wanted = {value.pk for value in values}
        siblings = product.variants.prefetch_related('values')
        if self.instance:
            siblings = siblings.exclude(pk=self.instance.pk)
        if any({value.pk for value in sibling.values.all()} == wanted for sibling in siblings):
            raise serializers.ValidationError({'values': 'This product already has a variant with these values.'})
        return attrs


class ProductSerializer(serializers.ModelSerializer):
    tax_details = TaxSerializer(source='taxes', many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = ['id', 'name', 'product_type', 'sales_price', 'cost_price', 'notes', 'taxes', 'tax_details',
                  'variants', 'is_active', 'created_at']
        read_only_fields = ['created_at']


class PlanSerializer(serializers.ModelSerializer):
    tax_details = TaxSerializer(source='taxes', many=True, read_only=True)

    class Meta:
        model = Plan
        fields = ['id', 'name', 'price', 'billing_period', 'billing_interval', 'min_quantity', 'start_date',
                  'end_date', 'auto_close', 'closable', 'pausable', 'renewable', 'taxes', 'tax_details',
                  'description', 'is_active']

    def validate(self, attrs):
        check_date_range(attrs, self.instance)
        return attrs


class DiscountSerializer(serializers.ModelSerializer):
    product_names = serializers.SlugRelatedField(source='products', slug_field='name', many=True, read_only=True)
    remaining_uses = serializers.IntegerField(read_only=True)

    class Meta:
        model = Discount
        fields = ['id', 'name', 'discount_type', 'value', 'min_purchase_amount', 'min_quantity', 'start_date',
                  'end_date', 'usage_limit', 'used_count', 'remaining_uses', 'scope', 'products', 'product_names',
                  'is_active']
        read_only_fields = ['used_count']

    def validate(self, attrs):
        check_date_range(attrs, self.instance)

        def current(field):
            return attrs.get(field, getattr(self.instance, field, None))

        if current('value') is not None and current('value') <= Decimal('0'):
            raise serializers.ValidationError({'value': 'The discount must be greater than zero.'})
        if current('discount_type') == Discount.DiscountType.PERCENT and current('value') > 100:
            raise serializers.ValidationError({'value': 'A percentage discount cannot exceed 100.'})

        products = attrs.get('products', list(self.instance.products.all()) if self.instance else [])
        if current('scope') == Discount.Scope.PRODUCTS and not products:
            raise serializers.ValidationError({'products': 'Choose the products this discount applies to.'})
        if current('scope') == Discount.Scope.SUBSCRIPTION:
            attrs['products'] = []
        return attrs
