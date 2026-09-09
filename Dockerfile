# syntax=docker/dockerfile:1.7

# ── Build ────────────────────────────────────────────────────────────────────
#
# Pinned to $BUILDPLATFORM on purpose. A multi-architecture build would otherwise
# run the whole JavaScript toolchain under QEMU emulation for the non-native
# architecture, which turns a one-minute build into a two-hour one. The compiled
# output is plain static files and is identical whatever CPU produced it, so only
# the runtime stage below needs to be built per architecture.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

# Install dependencies from the lockfile first, in their own layer, so editing
# source does not re-download the world.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# A broken build must never produce an image. The type check and the unit tests
# run here, not in a separate job that could drift out of step with what ships.
RUN npm run typecheck \
 && npx vitest run --reporter=dot \
 && npx vite build

# ── Runtime ──────────────────────────────────────────────────────────────────
# Deliberately NOT pinned to $BUILDPLATFORM: this stage is built for each target
# architecture so the resulting image runs natively.
FROM nginx:alpine AS runtime

LABEL org.opencontainers.image.title="Antinode" \
      org.opencontainers.image.description="An interactive 3D explorer of the Icom IC-7300 signal path, from microphone to antenna." \
      org.opencontainers.image.source="https://github.com/Atvriders/antinode" \
      org.opencontainers.image.licenses="MIT"

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Run unprivileged on 8080. Nothing here needs root or a privileged port.
#
# The temp directories are created here AND the runtime mount is given the same
# ownership, because a tmpfs mounted over /var/cache/nginx replaces whatever the
# image put there with a fresh root-owned filesystem. Getting only the image
# half right produces a container that crash-loops on
# `mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)`.
RUN adduser -D -H -u 10001 antinode \
 && mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp \
 && chown -R antinode:antinode /var/cache/nginx /usr/share/nginx/html

USER antinode
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
