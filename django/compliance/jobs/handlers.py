############################################################
#  [*] jobs.handlers — the registered kinds
#
#  Every app that owns background work registers its
#  handlers with @register in its own module; importing those
#  modules here makes the registry complete in the worker and
#  in the web process alike (the API validates kinds on
#  enqueue). The smoke-test kind lives here.
#
#    corpus.ingest / corpus.reembed / corpus.refresh_all
#                                       — corpus/ingest.py
#    corpus.extract_obligations         — corpus/obligations.py
#    documents.index                    — companies/indexing.py
#    report.analyze                     — analysis/pipeline.py
#    ops.maintenance                    — ops/maintenance.py
############################################################


import time


from compliance.jobs.registry import register

# Handler modules — imported for their @register side effect
from compliance.analysis import pipeline  # noqa: F401,E402
from compliance.companies import indexing  # noqa: F401,E402
from compliance.corpus import ingest, obligations, sanctions, verify  # noqa: F401,E402
from compliance.ops import maintenance  # noqa: F401,E402
from compliance.programme import run as programme_run  # noqa: F401,E402








############################################################
# noop
############################################################
#
# The smoke test: N tiny steps with progress, an optional
# sleep per step, a forced failure and cancellation checks
# in between — enough to exercise every runner path.
#
# Used by:
#   - tests/test_jobs.py
#   - manual smoke runs (manage.py shell → enqueue("ops.noop"))
############################################################

@register("ops.noop")
def noop(job, ctx):
    steps = int(job.payload.get("steps", 1))
    for i in range(steps):
        ctx.check_cancelled()
        with ctx.step(f"noop-{i + 1}") as step:
            if job.payload.get("sleep"):
                time.sleep(float(job.payload["sleep"]))
            step.output = {"index": i + 1}
        ctx.progress(f"noop-{i + 1}", int((i + 1) * 100 / steps), None)
    if job.payload.get("fail"):
        raise RuntimeError("forced failure")
    return {"steps": steps}
