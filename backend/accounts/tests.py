import re

from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import User
from .validators import PasswordComplexityValidator

GOOD_PASSWORD = 'Brightloop#2026'


class PasswordValidatorTests(APITestCase):
    def test_rejects_weak_passwords(self):
        validator = PasswordComplexityValidator()
        for weak in ['Abcdef!g', 'lowercase#123', 'UPPERCASE#123', 'NoSpecial123']:
            with self.subTest(password=weak), self.assertRaises(ValidationError):
                validator.validate(weak)

    def test_accepts_strong_password(self):
        PasswordComplexityValidator().validate('Abcdefg!h')


class AuthApiTests(APITestCase):
    def setUp(self):
        cache.clear()

    def signup(self, **overrides):
        data = {'email': 'owner@shop.com', 'password': GOOD_PASSWORD, 'first_name': 'Asha',
                'company_name': 'Small Shop'}
        data.update(overrides)
        return self.client.post('/api/auth/signup/', data)

    def test_signup_creates_customer_and_returns_token(self):
        response = self.signup(role='admin')
        self.assertEqual(response.status_code, 201)
        self.assertIn('token', response.data)
        user = User.objects.get(email='owner@shop.com')
        self.assertEqual(user.role, User.Role.CUSTOMER)

    def test_signup_rejects_duplicate_email_case_insensitively(self):
        self.signup()
        response = self.signup(email='OWNER@Shop.com')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_signup_rejects_weak_password(self):
        response = self.signup(password='weakpass')
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)

    def test_login_and_logout(self):
        self.signup()
        response = self.client.post('/api/auth/login/', {'email': 'Owner@shop.com', 'password': GOOD_PASSWORD})
        self.assertEqual(response.status_code, 200)
        token = response.data['token']

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        self.assertEqual(self.client.get('/api/auth/me/').data['email'], 'owner@shop.com')
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 204)
        self.assertFalse(Token.objects.filter(key=token).exists())

    def test_login_rejects_wrong_password_and_inactive_user(self):
        self.signup()
        bad = self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': 'Wrong#Password1'})
        self.assertEqual(bad.status_code, 400)

        User.objects.filter(email='owner@shop.com').update(is_active=False)
        inactive = self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': GOOD_PASSWORD})
        self.assertEqual(inactive.status_code, 400)

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)

    def test_password_reset_flow(self):
        self.signup()
        response = self.client.post('/api/auth/password-reset/', {'email': 'owner@shop.com'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        uid, token = re.search(r'/reset-password/([^/]+)/([^/\s]+)', mail.outbox[0].body).groups()

        payload = {'uid': uid, 'token': token, 'password': 'NewSecret#2026'}
        self.assertEqual(self.client.post('/api/auth/password-reset/confirm/', payload).status_code, 200)
        self.assertEqual(self.client.post('/api/auth/password-reset/confirm/', payload).status_code, 400)

        login = self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': 'NewSecret#2026'})
        self.assertEqual(login.status_code, 200)

    def test_password_reset_does_not_reveal_unknown_email(self):
        response = self.client.post('/api/auth/password-reset/', {'email': 'nobody@nowhere.com'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)


class RolePermissionTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser('admin@brightloop.com', GOOD_PASSWORD)
        self.staff = User.objects.create_user('staff@brightloop.com', GOOD_PASSWORD, role=User.Role.STAFF)
        self.customer = User.objects.create_user('client@shop.com', GOOD_PASSWORD)

    def test_only_admin_can_add_staff(self):
        payload = {'email': 'new.staff@brightloop.com', 'first_name': 'Ravi'}

        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.post('/api/users/staff/', payload).status_code, 403)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.post('/api/users/staff/', payload).status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/users/staff/', payload)
        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email='new.staff@brightloop.com')
        self.assertEqual(created.role, User.Role.STAFF)
        self.assertFalse(created.has_usable_password())
        self.assertIn('/reset-password/', mail.outbox[0].body)

    def test_staff_manage_customers_but_customers_cannot(self):
        self.client.force_authenticate(self.staff)
        listing = self.client.get('/api/users/customers/')
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([row['email'] for row in listing.data['results']], ['client@shop.com'])
        created = self.client.post('/api/users/customers/', {'email': 'big@corp.com', 'company_name': 'Big Corp'})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['role'], User.Role.CUSTOMER)

        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get('/api/users/customers/').status_code, 403)

    def test_superuser_gets_admin_role(self):
        self.assertEqual(self.admin.role, User.Role.ADMIN)
        self.assertTrue(self.admin.is_admin)
