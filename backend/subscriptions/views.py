from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrStaffReadOnly, IsStaffOrAdmin
from billing import services as billing_services
from catalog.views import CatalogViewSet

from . import services
from .models import QuotationTemplate, Subscription, SubscriptionLine
from .serializers import (
    FromTemplateSerializer,
    QuotationTemplateSerializer,
    SubscriptionListSerializer,
    SubscriptionSerializer,
)


class QuotationTemplateViewSet(CatalogViewSet):
    permission_classes = [IsAdminOrStaffReadOnly]
    queryset = QuotationTemplate.objects.select_related('plan').prefetch_related('lines__product', 'lines__variant')
    serializer_class = QuotationTemplateSerializer
    filterset_fields = ['plan', 'is_active']
    search_fields = ['name']


class SubscriptionViewSet(viewsets.ModelViewSet):
    filterset_fields = ['state', 'plan', 'customer']
    search_fields = ['number', 'customer__email', 'customer__company_name', 'customer__first_name',
                     'customer__last_name']
    ordering_fields = ['created_at', 'number', 'start_date', 'expiry_date', 'next_invoice_date', 'amount_total']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in ('create', 'partial_update', 'destroy', 'from_template'):
            return [IsStaffOrAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        queryset = Subscription.objects.select_related('customer', 'plan', 'template')
        if not user.is_internal:
            queryset = queryset.filter(customer=user).exclude(state=Subscription.State.DRAFT)
        if self.action != 'list':
            queryset = queryset.prefetch_related(
                Prefetch('lines', queryset=SubscriptionLine.objects.prefetch_related('taxes')),
                'events__user',
            )
        return queryset

    def get_serializer_class(self):
        return SubscriptionListSerializer if self.action == 'list' else SubscriptionSerializer

    def perform_destroy(self, instance):
        if instance.state != Subscription.State.DRAFT:
            raise ValidationError('Only drafts can be deleted. Close the subscription instead.')
        instance.delete()

    def detail_response(self, subscription, status_code=status.HTTP_200_OK):
        subscription = self.get_queryset().get(pk=subscription.pk)
        return Response(SubscriptionSerializer(subscription, context=self.get_serializer_context()).data,
                        status=status_code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self.detail_response(serializer.save(), status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return self.detail_response(serializer.save())

    @action(detail=True, methods=['post'], url_path=r'actions/(?P<name>[a-z_]+)')
    def run_action(self, request, pk=None, name=None):
        try:
            subscription = services.perform_action(self.get_object(), name, request.user,
                                                   note=str(request.data.get('note', ''))[:255])
        except services.TransitionError as exc:
            raise ValidationError(str(exc))
        return self.detail_response(subscription)

    @action(detail=True, methods=['post'], url_path='invoice', permission_classes=[IsStaffOrAdmin])
    def create_invoice(self, request, pk=None):
        subscription = self.get_object()
        try:
            invoice = billing_services.generate_invoice(subscription.pk, user=request.user)
        except billing_services.BillingError as exc:
            raise ValidationError(str(exc))
        return Response({'id': invoice.pk, 'number': invoice.number}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='from-template')
    def from_template(self, request):
        serializer = FromTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscription = services.create_from_template(user=request.user, **serializer.validated_data)
        return self.detail_response(subscription, status.HTTP_201_CREATED)
