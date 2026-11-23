############################################################
#  [*] Timestamps — one stamp kind, aware UTC
#
#  utc_now() is the only clock the code reads; the wire
#  shape is isoformat() with its "+00:00" (see common/http).
############################################################


from datetime import datetime, timezone








############################################################
# utc_now
############################################################
#
# The aware UTC instant every created_at / updated_at holds.
#
# Used by:
#   - every model write in the project
############################################################

def utc_now():
    return datetime.now(timezone.utc)








############################################################
# utc_now_iso
############################################################
#
# The same instant as the wire string, for places that need
# text (log lines, file names).
#
# Used by:
#   - nothing calls this at the moment
############################################################

def utc_now_iso():
    return utc_now().isoformat()
