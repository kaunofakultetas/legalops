# Written by hand on 2026-11-12 in the form Django 5.2.17 generates

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0004_companystandard'),
    ]

    operations = [
        migrations.AddField(
            model_name='companydocument',
            name='requirements_key',
            field=models.TextField(blank=True, default=''),
        ),
    ]
