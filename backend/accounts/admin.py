from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm as BaseUserChangeForm
from django.contrib.auth.forms import UserCreationForm as BaseUserCreationForm

from .models import User


class UserCreationForm(BaseUserCreationForm):
    class Meta:
        model = User
        fields = ['email', 'role']


class UserChangeForm(BaseUserChangeForm):
    class Meta:
        model = User
        fields = '__all__'


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    ordering = ['email']
    list_display = ['email', 'first_name', 'last_name', 'role', 'company_name', 'is_active']
    list_filter = ['role', 'is_active']
    search_fields = ['email', 'first_name', 'last_name', 'company_name']
    fieldsets = [
        (None, {'fields': ['email', 'password', 'role']}),
        ('Profile', {'fields': ['first_name', 'last_name', 'company_name', 'phone', 'address']}),
        ('Permissions', {'fields': ['is_active', 'is_staff', 'is_superuser']}),
        ('Dates', {'fields': ['last_login', 'date_joined']}),
    ]
    add_fieldsets = [
        (None, {'classes': ['wide'], 'fields': ['email', 'role', 'password1', 'password2']}),
    ]
