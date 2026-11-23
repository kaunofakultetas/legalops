############################################################
#  [*] programme.serializers — a work product on the wire
#
#    serialize_product(product, full=False, job=None)
#
#  The list form carries everything but the content; the full
#  form adds it. With the job, its progress while the product
#  is being generated.
############################################################








############################################################
# _name
############################################################
#
# How a user is shown: the display name, or the email.
#
# Used by:
#   - serialize_product (below)
############################################################

def _name(user):
    return (user.display_name or user.email) if user is not None else None








############################################################
# serialize_product
############################################################
#
# Used by:
#   - programme/api/views.py
############################################################

def serialize_product(product, full=False, job=None):
    data = {
        "id": product.id,
        "companyId": product.company_id,
        "companyName": product.company.name if product.company_id else None,
        "kind": product.kind,
        "version": product.version,
        "language": product.language,
        "status": product.status,
        "title": product.title,
        "checks": product.checks,
        "basis": product.basis,
        "stats": product.stats,
        "error": product.error,
        "jobId": product.job_id,
        "createdBy": product.created_by_id,
        "createdAt": product.created_at,
        "startedAt": product.started_at,
        "finishedAt": product.finished_at,
        "editedByName": _name(product.edited_by) if product.edited_by_id else None,
        "editedAt": product.edited_at,
        "approvedBy": product.approved_by_id,
        "approvedByName": _name(product.approved_by) if product.approved_by_id else None,
        "approvedAt": product.approved_at,
        "approvalNote": product.approval_note,
    }
    if job is not None:
        data["progress"] = job.progress
        data["jobStatus"] = job.status
    if full:
        data["content"] = product.content
    return data
