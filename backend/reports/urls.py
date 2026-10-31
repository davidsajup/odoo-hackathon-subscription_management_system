from django.urls import path

from . import views

urlpatterns = [
    path('summary/', views.summary, name='report-summary'),
    path('revenue-trend/', views.revenue_trend, name='report-revenue-trend'),
    path('my-summary/', views.my_summary, name='report-my-summary'),
]
