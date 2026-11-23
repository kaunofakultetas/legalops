############################################################
#  [*] middleware — refuse garbage before any view runs
#
#    RequestGuardMiddleware
#      - a NUL character in the path or query string → 400
#        (Postgres TEXT refuses NUL; a lookup with one would
#        otherwise end in a 500)
#      - DataError / ValidationError escaping a view (a value
#        the database refuses: out-of-range integers, index
#        row too large, a malformed timestamp) → 400 JSON
#        instead of a 500
############################################################


import logging


from django.core.exceptions import ValidationError
from django.db import DataError


from compliance.common.http import json_error


logger = logging.getLogger(__name__)








############################################################
# RequestGuardMiddleware
############################################################
#
# Used by:
#   - settings.py — MIDDLEWARE
############################################################

class RequestGuardMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response






    ############################################################
    # __call__
    ############################################################
    #
    # The NUL gate in front of every request.
    #
    # Used by:
    #   - Django's request handling
    ############################################################

    def __call__(self, request):
        if "\x00" in request.path or "%00" in request.META.get("QUERY_STRING", "") \
                or any("\x00" in v for values in request.GET.lists() for v in values[1]):
            return json_error("Invalid characters in the request", 400, code="BAD_REQUEST")
        return self.get_response(request)






    ############################################################
    # process_exception
    ############################################################
    #
    # Database-refused values become a 400; everything else
    # continues to Django's 500 handling.
    #
    # Used by:
    #   - Django's request handling
    ############################################################

    def process_exception(self, request, exception):
        if isinstance(exception, (DataError, ValidationError)):
            logger.info("Refused value on %s %s: %s", request.method, request.path, exception)
            return json_error("A value in the request is invalid or out of range", 400, code="INVALID_VALUE")
        return None
