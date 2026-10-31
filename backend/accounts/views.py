from django.contrib.auth.models import update_last_login
from rest_framework import generics, mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .emails import send_account_created_email, send_password_reset_email
from .models import User
from .permissions import IsAdmin, IsStaffOrAdmin
from .serializers import (
    LoginSerializer,
    ManagedUserSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    UserSerializer,
)


def auth_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {'token': token.key, 'user': UserSerializer(user).data}


class PublicAuthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'


class SignupView(PublicAuthView):
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(auth_payload(user), status=status.HTTP_201_CREATED)


class LoginView(PublicAuthView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        update_last_login(None, user)
        return Response(auth_payload(user))


class PasswordResetView(PublicAuthView):
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data['email'], is_active=True).first()
        if user:
            send_password_reset_email(user)
        return Response({'detail': 'If an account exists for this email, a reset link has been sent.'})


class PasswordResetConfirmView(PublicAuthView):
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Your password has been updated. You can now log in.'})


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ManagedUserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                         mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = ManagedUserSerializer
    filterset_fields = ['is_active']
    search_fields = ['email', 'first_name', 'last_name', 'company_name']
    ordering_fields = ['date_joined', 'email', 'first_name', 'company_name']
    role = None

    def get_queryset(self):
        return User.objects.filter(role=self.role)

    def perform_create(self, serializer):
        user = serializer.save(role=self.role)
        user.set_unusable_password()
        user.save(update_fields=['password'])
        send_account_created_email(user)


class StaffViewSet(ManagedUserViewSet):
    permission_classes = [IsAdmin]
    role = User.Role.STAFF


class CustomerViewSet(ManagedUserViewSet):
    permission_classes = [IsStaffOrAdmin]
    role = User.Role.CUSTOMER
