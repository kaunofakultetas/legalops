# Written by hand on 2026-11-12 in the form Django 5.2.17 generates

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('analysis', '0008_reportact_assessment'),
        ('users', '0003_remove_user_token_budget_user_daily_budget_usd'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='scope_approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='report',
            name='scope_approved_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='users.user'),
        ),
        migrations.RemoveConstraint(
            model_name='report',
            name='reports_status_check',
        ),
        migrations.AddConstraint(
            model_name='report',
            constraint=models.CheckConstraint(condition=models.Q(('status__in', ('queued', 'running', 'scope_review', 'done', 'failed', 'cancelled'))), name='reports_status_check'),
        ),
    ]
