from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('taxes', views.TaxViewSet, basename='tax')
router.register('products', views.ProductViewSet, basename='product')
router.register('attributes', views.ProductAttributeViewSet, basename='attribute')
router.register('variants', views.ProductVariantViewSet, basename='variant')
router.register('plans', views.PlanViewSet, basename='plan')
router.register('discounts', views.DiscountViewSet, basename='discount')

urlpatterns = router.urls
