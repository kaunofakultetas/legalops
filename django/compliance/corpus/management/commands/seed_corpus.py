############################################################
#  [*] seed_corpus — load the seed catalog of legal acts
#
#  Reads corpus/catalog.yaml (verified sources: CELLAR for EU
#  acts, e-tar for Lithuanian ones, lb.lt for the Bank of
#  Lithuania's pages) and creates the LegalDocument rows that
#  do not exist yet; each new, enabled act gets a corpus.ingest
#  job, which the worker runs one after another (the fetchers
#  pace themselves to one request per second per host). An
#  act of the source "upload" has nothing to fetch: its row
#  waits for a person to upload the file on the act's page.
#  Existing acts are left alone — after the first seed the
#  database is the truth. --only limits the seed to the named
#  catalogue slugs; --no-ingest creates the rows without
#  queuing their fetch.
#
#  Used by:
#    - the operator, by hand: catalog acts newer than
#      postgres/bootstrap.sql.gz, or a database that did not
#      start from it (docs/markdown/en/operations.md §6)
############################################################


import uuid
from pathlib import Path


import yaml
from django.core.management.base import BaseCommand, CommandError


from compliance.common.timestamps import utc_now
from compliance.corpus.api.views import APPLIES_TO, DOMAIN_TAG
from compliance.corpus.models import DOC_STATUSES, DOC_TYPES, JURISDICTIONS, SOURCE_KINDS, LegalDocument
from compliance.jobs.queue import enqueue


CATALOG = Path(__file__).resolve().parents[2] / "catalog.yaml"








############################################################
# _validated
############################################################
#
# One catalog entry → LegalDocument field values, or a
# CommandError naming what is wrong with it.
#
# Used by:
#   - Command.handle (below)
############################################################

def _validated(entry):
    slug = entry.get("slug") or "?"
    checks = {"jurisdiction": JURISDICTIONS, "doc_type": DOC_TYPES, "source": SOURCE_KINDS, "status": DOC_STATUSES}
    for key, allowed in checks.items():
        if entry.get(key) not in allowed:
            raise CommandError(f"{slug}: {key} must be one of {', '.join(allowed)}")
    domains, applies = entry.get("domains") or [], entry.get("applies_to") or []
    if not all(DOMAIN_TAG.match(d) for d in domains) or not set(applies) <= APPLIES_TO:
        raise CommandError(f"{slug}: unknown domain or applies_to value")
    return {
        "slug": slug, "title": entry["title"], "title_en": entry.get("title_en") or "",
        "short_title": entry.get("short_title") or "", "jurisdiction": entry["jurisdiction"],
        "doc_type": entry["doc_type"], "source_kind": entry["source"], "external_id": entry.get("external_id") or "",
        "source_url": entry.get("source_url") or "", "language": "lt", "domains": sorted(set(domains)),
        "applies_to": sorted(set(applies)), "applicability_notes": entry.get("notes") or "",
        "status": entry["status"], "enabled": bool(entry.get("enabled", True)),
    }








class Command(BaseCommand):
    help = "Create the acts of the seed catalog that do not exist yet and queue their ingestion"

    def add_arguments(self, parser):
        parser.add_argument("--catalog", default=str(CATALOG))
        parser.add_argument("--only", default="", help="comma-separated slugs")
        parser.add_argument("--no-ingest", action="store_true", help="create the rows without queueing a fetch")

    def handle(self, *args, **options):
        catalog = yaml.safe_load(Path(options["catalog"]).read_text(encoding="utf-8"))
        only = {s.strip() for s in options["only"].split(",") if s.strip()}
        created, queued, skipped, waiting = [], 0, 0, []
        for entry in catalog.get("acts", []):
            if only and entry.get("slug") not in only:
                continue
            fields = _validated(entry)
            if LegalDocument.objects.filter(slug=fields["slug"]).exists():
                skipped += 1
                continue
            now = utc_now()
            document = LegalDocument.objects.create(id=str(uuid.uuid4()), created_at=now, updated_at=now, **fields)
            created.append(document.slug)
            if document.source_kind == "upload":
                waiting.append(document.slug)
            elif document.enabled and not options["no_ingest"]:
                enqueue("corpus.ingest", {"document_id": document.id}, subject=f"corpus:{document.id}")
                queued += 1
        self.stdout.write(f"Created {len(created)} act(s), queued {queued} ingestion(s), "
                          f"{skipped} already present" + (f": {', '.join(created)}" if created else ""))
        if waiting:
            self.stdout.write(f"Waiting for an uploaded file (corpus page): {', '.join(waiting)}")
