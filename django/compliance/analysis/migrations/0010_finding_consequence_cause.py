# Written by hand on 2026-11-12 in the form Django 5.2.17 generates

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('analysis', '0009_report_scope_review'),
    ]

    operations = [
        migrations.AddField(
            model_name='finding',
            name='cause',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='finding',
            name='consequence',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
