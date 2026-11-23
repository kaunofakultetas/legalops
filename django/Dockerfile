############################################################
#  [*] legalops-django — image build
#
#  The image of legalops-django: the JSON API under
#  gunicorn, tuned in gunicorn.conf.py; DJANGO_RUNSERVER=True
#  runs the dev runserver instead (compose then bind-mounts
#  ./django:/app over the baked copy). The worker loop runs
#  in the same container (legalops-worker starts it with
#  docker exec), and runUpdateThisStack.sh migrates there.
#
#  The sources are byte-compiled at build time and nothing
#  writes .pyc at run time (PYTHONDONTWRITEBYTECODE): the
#  container runs read_only, and a dev bind mount stays free
#  of root-owned __pycache__ folders.
############################################################

FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app


# System libraries WeasyPrint renders PDFs with (Pango,
# HarfBuzz) and a font with every Lithuanian glyph
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*


# Django + configuration + the postgres driver + the
# assistant's vector column type (the extension itself is
# baked into the postgres image; this is the ORM side)
RUN pip install --no-cache-dir                  \
    django==5.2.17                              \
    django-environ==0.14.0                      \
    "psycopg[binary]==3.3.6"                    \
    pgvector==0.5.0

# Auth + serving
RUN pip install --no-cache-dir                  \
    bcrypt==5.0.0                               \
    gunicorn==26.2.0

# Outbound HTTP (the corpus fetchers)
RUN pip install --no-cache-dir                  \
    requests==2.34.2

# Document text extraction (PDF, DOCX, HTML) + the prompt
# defaults (YAML). cryptography is what pypdf opens an
# AES-secured PDF with — a purchased standard or a policy
# "protected against editing" is often one
RUN pip install --no-cache-dir                  \
    pypdf==6.19.0                                \
    cryptography==50.0.2                        \
    python-docx==1.2.0                          \
    lxml==6.1.3                                 \
    pyyaml==6.0.3

# Report exports: PDF (WeasyPrint), Excel (openpyxl), the
# summary's markdown
RUN pip install --no-cache-dir                  \
    weasyprint==70.0                            \
    openpyxl==3.1.5                             \
    markdown==3.11


# Copy source code, compiled once here — see the header
COPY . /app
RUN python3 -m compileall -q /app


# Run
#
# Prod: `exec` makes gunicorn PID 1, so compose's SIGTERM
# reaches its graceful shutdown (gunicorn.conf.py). The
# schema is migrated after the start, by runUpdateThisStack.sh.
# Dev: the database must answer before runserver starts —
# its autoreloader would otherwise keep the container alive
# with a dead child after a startup connection failure
EXPOSE 8000
CMD ["sh", "-c", "if [ \"$DJANGO_RUNSERVER\" = 'True' ]; then until python3 manage.py check --database default >/dev/null 2>&1; do echo 'waiting for the database...'; sleep 2; done; exec python3 manage.py runserver 0.0.0.0:8000; else exec gunicorn --config gunicorn.conf.py compliance.wsgi:application; fi"]
