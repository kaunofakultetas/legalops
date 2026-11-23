# Written by hand on 2026-11-12 in the form Django 5.2.17 generates

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('corpus', '0007_obligation_verification'),
    ]

    operations = [
        migrations.AddField(
            model_name='legaldocumentversion',
            name='sanctions',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
