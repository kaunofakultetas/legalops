# Standards in the corpus: the INTL jurisdiction (ISO, IEC)
# and the clause unit of a standard's structure tree — both
# check constraints widened, no data touched.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('corpus', '0004_obligation_embedding_en'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='legaldocument',
            name='legal_documents_jurisdiction_check',
        ),
        migrations.AddConstraint(
            model_name='legaldocument',
            constraint=models.CheckConstraint(condition=models.Q(('jurisdiction__in', ('EU', 'LT', 'INTL'))), name='legal_documents_jurisdiction_check'),
        ),
        migrations.RemoveConstraint(
            model_name='legalunit',
            name='legal_units_type_check',
        ),
        migrations.AddConstraint(
            model_name='legalunit',
            constraint=models.CheckConstraint(condition=models.Q(('unit_type__in', ('part', 'title', 'chapter', 'section', 'subsection', 'article', 'paragraph', 'point', 'subpoint', 'annex', 'recital', 'preamble', 'text', 'clause'))), name='legal_units_type_check'),
        ),
    ]
