from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin


class IsStaffOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_internal


class IsAdminOrStaffReadOnly(BasePermission):
    def has_permission(self, request, view):
        if not (request.user.is_authenticated and request.user.is_internal):
            return False
        return request.method in SAFE_METHODS or request.user.is_admin
