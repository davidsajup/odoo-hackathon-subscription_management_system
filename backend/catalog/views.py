from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from accounts.permissions import IsAdminOrStaffReadOnly

from .models import Discount, Plan, Product, ProductAttribute, ProductVariant, Tax
from .serializers import (
    DiscountSerializer,
    PlanSerializer,
    ProductAttributeSerializer,
    ProductSerializer,
    ProductVariantSerializer,
    TaxSerializer,
)


class CatalogViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrStaffReadOnly]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'This record is already in use. Archive it instead of deleting it.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class TaxViewSet(CatalogViewSet):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    filterset_fields = ['tax_type', 'is_active']
    search_fields = ['name']


class ProductViewSet(CatalogViewSet):
    queryset = Product.objects.prefetch_related('taxes', 'variants__values__attribute', 'variants__product')
    serializer_class = ProductSerializer
    filterset_fields = ['product_type', 'is_active']
    search_fields = ['name', 'notes']
    ordering_fields = ['name', 'sales_price', 'created_at']


class ProductAttributeViewSet(CatalogViewSet):
    queryset = ProductAttribute.objects.prefetch_related('values__attribute')
    serializer_class = ProductAttributeSerializer
    search_fields = ['name']


class ProductVariantViewSet(CatalogViewSet):
    queryset = ProductVariant.objects.select_related('product').prefetch_related('values__attribute')
    serializer_class = ProductVariantSerializer
    filterset_fields = ['product', 'is_active']


class PlanViewSet(CatalogViewSet):
    queryset = Plan.objects.all()
    serializer_class = PlanSerializer
    filterset_fields = ['billing_period', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'price']


class DiscountViewSet(CatalogViewSet):
    queryset = Discount.objects.prefetch_related('products')
    serializer_class = DiscountSerializer
    filterset_fields = ['discount_type', 'scope', 'is_active']
    search_fields = ['name']
