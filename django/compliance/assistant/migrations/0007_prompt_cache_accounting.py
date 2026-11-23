# The provider caches a prompt's repeated prefix and bills
# input read from that cache at a fraction of the input
# price, and input written to it slightly above: a call's
# cost is right only when the three kinds of input token are
# counted apart. Calls recorded before this keep 0 in both
# new columns — their cost stays as it was computed.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assistant', '0006_llmcall_job_step_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='llmcall',
            name='cached_input_tokens',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='llmcall',
            name='cache_write_tokens',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='modelprice',
            name='cache_read_per_token',
            field=models.DecimalField(blank=True, decimal_places=12, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name='modelprice',
            name='cache_write_per_token',
            field=models.DecimalField(blank=True, decimal_places=12, max_digits=20, null=True),
        ),
    ]
