#!/bin/bash
# -----------------------------------------------------------
#  [*] The first administrator
#
#  A new installation has no account at all and no default
#  login, and only an admin can create accounts — this is the
#  way in. Asks for an e-mail and a password and creates that
#  admin in the running stack; the password is the operator's
#  choice, with no minimum length. An account that already
#  exists is left as it is.
# -----------------------------------------------------------
cd "$(dirname "$0")"



# STEP 1: Ask for the e-mail and the password
# ===========================================
read -rp "Admin e-mail: " ADMIN_EMAIL
read -rsp "Admin password: " ADMIN_PASSWORD; echo
export ADMIN_PASSWORD




# STEP 2: Create the account
# ==========================
# The password travels by environment: on a command line
# every process listing would show it
sudo --preserve-env=ADMIN_PASSWORD docker-compose exec -T -e ADMIN_PASSWORD legalops-django \
    python3 manage.py create_admin --email "$ADMIN_EMAIL" --password-env ADMIN_PASSWORD
