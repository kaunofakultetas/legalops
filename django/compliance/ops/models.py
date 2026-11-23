############################################################
#  [*] ops — operational state
#
#  Models:
#    - RateLimitWindow — one fixed window per limiter key
#                        (common/ratelimit.py); shared by every
#                        web worker, swept by ops.maintenance
#
#  Tables: rate_limit_windows
############################################################


from django.db import models


class RateLimitWindow(models.Model):
    key = models.TextField(primary_key=True)
    count = models.IntegerField()
    reset_at = models.DateTimeField()

    class Meta:
        db_table = "rate_limit_windows"
        indexes = [models.Index(fields=["reset_at"], name="rate_limit_windows_reset_idx")]
