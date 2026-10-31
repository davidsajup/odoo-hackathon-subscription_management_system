import re

from django.core.exceptions import ValidationError


class PasswordComplexityValidator:
    rules = [
        (lambda p: len(p) > 8, 'Password must be more than 8 characters.', 'password_too_short'),
        (lambda p: re.search(r'[A-Z]', p), 'Password must contain an uppercase letter.', 'password_no_upper'),
        (lambda p: re.search(r'[a-z]', p), 'Password must contain a lowercase letter.', 'password_no_lower'),
        (lambda p: re.search(r'[^A-Za-z0-9\s]', p), 'Password must contain a special character.', 'password_no_special'),
    ]

    def validate(self, password, user=None):
        errors = [ValidationError(message, code=code) for check, message, code in self.rules if not check(password)]
        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return 'More than 8 characters, with an uppercase letter, a lowercase letter and a special character.'
