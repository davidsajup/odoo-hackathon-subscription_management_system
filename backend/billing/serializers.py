from django.utils import timezone
from rest_framework import serializers

from . import services
from .models import Invoice, InvoiceLine, Payment


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ['id', 'product', 'description', 'quantity', 'unit_price', 'discount_amount', 'subtotal',
                  'tax_label', 'tax_amount', 'total']


class PaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.number', read_only=True)
    customer_name = serializers.CharField(source='invoice.billing_name', read_only=True)
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    payment_date = serializers.DateField(default=timezone.localdate)

    class Meta:
        model = Payment
        fields = ['id', 'invoice', 'invoice_number', 'customer_name', 'method', 'method_display', 'amount',
                  'payment_date', 'note', 'recorded_by_name', 'created_at']

    def get_recorded_by_name(self, payment):
        user = payment.recorded_by
        return (user.get_full_name() or user.email) if user else ''

    def validate_invoice(self, invoice):
        if not self.context['request'].user.is_internal:
            raise serializers.ValidationError('Only staff can record payments.')
        return invoice

    def create(self, validated_data):
        try:
            return services.record_payment(user=self.context['request'].user, **validated_data)
        except services.BillingError as exc:
            raise serializers.ValidationError({'amount': str(exc)})


class InvoiceListSerializer(serializers.ModelSerializer):
    subscription_number = serializers.CharField(source='subscription.number', read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = ['id', 'number', 'subscription', 'subscription_number', 'customer', 'billing_name', 'state',
                  'invoice_date', 'due_date', 'amount_total', 'amount_paid', 'amount_due', 'is_overdue']


class InvoiceSerializer(InvoiceListSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    discount_name = serializers.CharField(source='discount.name', read_only=True, default=None)
    plan_name = serializers.CharField(source='subscription.plan.name', read_only=True)
    available_actions = serializers.SerializerMethodField()

    class Meta(InvoiceListSerializer.Meta):
        fields = InvoiceListSerializer.Meta.fields + [
            'billing_email', 'billing_address', 'period_start', 'period_end', 'plan_name', 'discount_name',
            'amount_untaxed', 'amount_discount', 'amount_tax', 'lines', 'payments', 'confirmed_at', 'sent_at',
            'paid_at', 'created_at', 'available_actions']

    def get_available_actions(self, invoice):
        if not self.context['request'].user.is_internal:
            return []
        return services.available_invoice_actions(invoice)


class BulkConfirmSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=False)
