############################################################
#  [*] parallel — bounded concurrency for model calls
#
#    parallel_map(fn, items, workers=4) → [fn(item), …] in order
#
#  Pipeline steps spend their time waiting on the gateway;
#  running a few calls at once cuts a report from tens of
#  minutes to a few. Each worker thread gets its own database
#  connection (Django's are per-thread) and closes it when
#  done, so no connection leaks out of a job. The first
#  exception is re-raised after every call has settled.
############################################################


from concurrent.futures import ThreadPoolExecutor


from django.db import connection








############################################################
# parallel_map
############################################################
#
# Used by:
#   - corpus/obligations.py, analysis/pipeline.py,
#     companies/inventory.py
############################################################

def parallel_map(fn, items, workers=4):
    def run(item):
        try:
            return fn(item)
        finally:
            connection.close()

    items = list(items)
    if len(items) <= 1 or workers <= 1:
        return [fn(item) for item in items]
    with ThreadPoolExecutor(max_workers=min(workers, len(items))) as pool:
        futures = [pool.submit(run, item) for item in items]
        results, first_error = [], None
        for future in futures:
            try:
                results.append(future.result())
            except Exception as exc:
                results.append(None)
                first_error = first_error or exc
    if first_error is not None:
        raise first_error
    return results
