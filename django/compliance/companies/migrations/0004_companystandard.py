# The standards a company has adopted (company_standards).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0003_companyrole_companycredential_evidence_document_and_more'),
        ('corpus', '0005_standards'),
        ('users', '0002_user_token_budget'),
    ]

    operations = [
        migrations.CreateModel(
            name='CompanyStandard',
            fields=[
                ('id', models.TextField(primary_key=True, serialize=False)),
                ('status', models.TextField(default='implementing')),
                ('scope', models.TextField(blank=True, default='')),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField()),
                ('updated_at', models.DateTimeField()),
                ('certificate', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='standards', to='companies.companycredential')),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='standards', to='companies.company')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='users.user')),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='adoptions', to='corpus.legaldocument')),
            ],
            options={
                'db_table': 'company_standards',
                'constraints': [models.UniqueConstraint(fields=('company', 'document'), name='company_standards_unique_document'), models.CheckConstraint(condition=models.Q(('status__in', ('certified', 'implementing', 'planned'))), name='company_standards_status_check')],
            },
        ),
    ]
