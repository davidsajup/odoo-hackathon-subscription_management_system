from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('invoices', views.InvoiceViewSet, basename='invoice')
router.register('payments', views.PaymentViewSet, basename='payment')

urlpatterns = [
    path('billing/run/', views.run_billing, name='run-billing'),
    *router.urls,
]
