# Postgres with the schema baked in, so a production host needs only images and
# compose.prod.yml — no checkout to bind-mount db/init from.
#
# Same rule as local: these run once, in name order, when the data volume is
# first created. A new file here does nothing to an existing volume; apply it by
# hand (see README "Docker").
FROM postgres:17-alpine
COPY init/ /docker-entrypoint-initdb.d/
