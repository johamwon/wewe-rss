
#!/bin/sh
# ENVIRONEMTN from docker-compose.yaml doesn't get through to subprocesses
# Need to explicit pass DATABASE_URL here, otherwise migration doesn't work
set -e

if [ -z "$DATABASE_URL" ] && [ -n "$MYSQL_HOST" ] && [ -n "$MYSQL_USER" ] && [ -n "$MYSQL_PASSWORD" ] && [ -n "$MYSQL_DATABASE" ]; then
  MYSQL_PORT="${MYSQL_PORT:-3306}"
  DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}?schema=public&connect_timeout=30&pool_timeout=30&socket_timeout=30"
  export DATABASE_URL
fi

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is empty. Set DATABASE_URL or MYSQL_* env vars." >&2
  exit 1
fi

# Run migrations
DATABASE_URL=${DATABASE_URL} npx prisma migrate deploy
# start app
DATABASE_URL=${DATABASE_URL} node dist/main
