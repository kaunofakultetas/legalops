# How a report treated each act — assessed, assessed as
# preparation for a later date of application, left until
# the facts that decide its applicability are confirmed, a
# directive applying through national law, or not applicable
# — and the date from which an act applies when that is
# later than the run. Reports made before this assessed every
# applicable and uncertain act alike, which is what their
# rows are given: "assessed", or "none" for the acts judged
# not applicable or screened out.

from django.db import migrations, models


def backfill(apps, schema_editor):
    ReportAct = apps.get_model("analysis", "ReportAct")
    ReportAct.objects.filter(models.Q(applicability="not_applies") | models.Q(screened_out=True)).update(assessment="none")


class Migration(migrations.Migration):

    dependencies = [
        ('analysis', '0007_reportact_doc_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='reportact',
            name='applies_from',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='reportact',
            name='assessment',
            field=models.TextField(default='assessed'),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='reportact',
            constraint=models.CheckConstraint(
                condition=models.Q(('assessment__in', ('assessed', 'upcoming', 'unconfirmed', 'indirect', 'none'))),
                name='report_acts_assessment_check'),
        ),
    ]
