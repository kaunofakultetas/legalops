# Written by hand on 2026-11-12 in the form Django 5.2.17 generates

from django.db import migrations, models


# Institution types the acts' own scope provisions cover and
# the catalogue's lists lacked. On 2026-11-12 the scope
# provisions of all 51 enabled acts were read (corpus/scope.py)
# and each addition confirmed in the text: the Law on Financial
# Institutions applies to whoever provides the services of its
# Article 3 — crypto-asset services (24), crowdfunding (21),
# lending including mortgages (2); the crypto-asset markets law
# supervises the issuers of e-money and asset-referenced
# tokens, which are banks and e-money institutions; the e-money
# law names who may issue electronic money, banks among them,
# as does the directive behind it; Article 13 of the payment
# institutions law applies to credit unions. seed_corpus leaves
# an existing row alone, so the rows are widened here
SCOPE_ADDITIONS = {
    "finansu-istaigu-istatymas": ("casp", "crowdfunding", "real_estate_credit"),
    "kriptoturto-rinku-istatymas": ("bank", "emi"),
    "epei-istatymas": ("bank",),
    "mokejimo-istaigu-istatymas": ("credit_union",),
    "emd2": ("bank",),
}


# A list an admin emptied or opened to "all" already lets every
# company in: adding types to it would narrow it
def widen_lists(apps, schema_editor):
    LegalDocument = apps.get_model("corpus", "LegalDocument")
    for slug, kinds in SCOPE_ADDITIONS.items():
        for document in LegalDocument.objects.filter(slug=slug):
            listed = set(document.applies_to or [])
            if listed and "all" not in listed and not listed.issuperset(kinds):
                document.applies_to = sorted(listed.union(kinds))
                document.save(update_fields=["applies_to"])


class Migration(migrations.Migration):

    dependencies = [
        ('corpus', '0005_standards'),
    ]

    operations = [
        migrations.AddField(
            model_name='legaldocumentversion',
            name='scope',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.RunPython(widen_lists, migrations.RunPython.noop),
    ]
