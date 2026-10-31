from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from .models import User


def check_password_rules(password, user):
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({'password': list(exc.messages)})


class UniqueEmailMixin:
    def validate_email(self, value):
        value = value.lower()
        others = User.objects.filter(email__iexact=value)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'role', 'company_name', 'phone', 'address',
                  'is_active', 'date_joined']
        read_only_fields = ['id', 'email', 'role', 'is_active', 'date_joined']


class SignupSerializer(UniqueEmailMixin, serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'first_name', 'last_name', 'company_name', 'phone']
        extra_kwargs = {'email': {'validators': []}}

    def validate(self, attrs):
        profile = {key: value for key, value in attrs.items() if key != 'password'}
        check_password_rules(attrs['password'], User(**profile))
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(self.context.get('request'), username=attrs['email'].lower(),
                            password=attrs['password'])
        if user is None:
            raise serializers.ValidationError('Invalid email or password.')
        attrs['user'] = user
        return attrs


class ManagedUserSerializer(UniqueEmailMixin, serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'role', 'company_name', 'phone', 'address',
                  'is_active', 'date_joined']
        read_only_fields = ['id', 'role', 'date_joined']
        extra_kwargs = {'email': {'validators': []}}


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(attrs['uid'])), is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if user is None or not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError('This reset link is invalid or has expired.')
        check_password_rules(attrs['password'], user)
        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        user.set_password(self.validated_data['password'])
        user.save(update_fields=['password'])
        Token.objects.filter(user=user).delete()
        return user
