import django_filters
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsStaffOrAdmin

from . import services
from .models import Invoice, Payment
from .serializers import BulkConfirmSerializer, InvoiceListSerializer, InvoiceSerializer, PaymentSerializer


class InvoiceFilter(django_filters.FilterSet):
    overdue = django_filters.BooleanFilter(method='filter_overdue')
    date_from = django_filters.DateFilter(field_name='invoice_date', lookup_expr='gte')
    date_to = django_filters.DateFilter(field_name='invoice_date', lookup_expr='lte')

    class Meta:
        model = Invoice
        fields = ['state', 'customer', 'subscription']

    def filter_overdue(self, queryset, name, value):
        overdue = Q(state=Invoice.State.CONFIRMED, due_date__lt=timezone.localdate())
        return queryset.filter(overdue) if value else queryset.exclude(overdue)


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    filterset_class = InvoiceFilter
    search_fields = ['number', 'billing_name', 'billing_email', 'subscription__number']
    ordering_fields = ['invoice_date', 'due_date', 'amount_total', 'amount_due', 'number']

    def get_permissions(self):
        if self.action in ('run_action', 'bulk_confirm'):
            return [IsStaffOrAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        queryset = Invoice.objects.select_related('subscription', 'subscription__plan', 'discount')
        if not user.is_internal:
            queryset = queryset.filter(customer=user).exclude(state=Invoice.State.DRAFT)
        if self.action != 'list':
            queryset = queryset.prefetch_related('lines', 'payments__recorded_by')
        return queryset

    def get_serializer_class(self):
        return InvoiceListSerializer if self.action == 'list' else InvoiceSerializer

    def detail_response(self, invoice):
        invoice = self.get_queryset().get(pk=invoice.pk)
        return Response(InvoiceSerializer(invoice, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path=r'actions/(?P<name>[a-z_]+)')
    def run_action(self, request, pk=None, name=None):
        try:
            invoice = services.perform_invoice_action(self.get_object(), name)
        except services.BillingError as exc:
            raise ValidationError(str(exc))
        return self.detail_response(invoice)

    @action(detail=False, methods=['post'], url_path='bulk-confirm')
    def bulk_confirm(self, request):
        serializer = BulkConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        confirmed = services.confirm_drafts(serializer.validated_data.get('ids'))
        return Response({'confirmed': confirmed})


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = PaymentSerializer
    filterset_fields = ['invoice', 'method']
    search_fields = ['invoice__number', 'invoice__billing_name', 'note']
    ordering_fields = ['payment_date', 'amount']

    def get_permissions(self):
        if self.action in ('create', 'destroy'):
            return [IsStaffOrAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = Payment.objects.select_related('invoice', 'recorded_by')
        if not self.request.user.is_internal:
            queryset = queryset.filter(invoice__customer=self.request.user)
        return queryset

    def perform_destroy(self, payment):
        services.delete_payment(payment)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def run_billing(request):
    return Response(services.generate_due_invoices(user=request.user), status=status.HTTP_200_OK)
