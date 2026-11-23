# The doc_type of each act a report assessed — adopted
# standards are told apart from the acts the model judged.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('analysis', '0006_reportcitation'),
    ]

    operations = [
        migrations.AddField(
            model_name='reportact',
            name='doc_type',
            field=models.TextField(blank=True, default=''),
        ),
    ]
