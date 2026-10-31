from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsStaffOrAdmin

from . import services


class ReportFilterSerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    plan = serializers.IntegerField(required=False, min_value=1)
    months = serializers.IntegerField(required=False, min_value=1, max_value=36, default=12)

    def validate(self, attrs):
        today = timezone.localdate()
        attrs.setdefault('date_to', today)
        attrs.setdefault('date_from', attrs['date_to'].replace(day=1))
        if attrs['date_from'] > attrs['date_to']:
            raise serializers.ValidationError({'date_from': 'The start date must be before the end date.'})
        return attrs


def read_filters(request):
    serializer = ReportFilterSerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def summary(request):
    filters = read_filters(request)
    return Response(services.finance_summary(filters['date_from'], filters['date_to'], timezone.localdate(),
                                             filters.get('plan')))


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def revenue_trend(request):
    filters = read_filters(request)
    return Response(services.revenue_trend(filters['months'], timezone.localdate(), filters.get('plan')))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_summary(request):
    return Response(services.customer_summary(request.user, timezone.localdate()))
