# Stage 1: build the React app. VITE_API_BASE_URL=/api makes every API
# call same-origin (Caddy proxies /api/* to the backend and strips the
# prefix), so the samesite=lax session cookie just works -- no CORS.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API_BASE_URL=/api
RUN npm run build

# Stage 2: Caddy serves the static build and reverse-proxies the API.
# The Caddyfile is volume-mounted by docker-compose (repo root), so
# proxy/TLS tweaks don't require rebuilding this image.
FROM caddy:2
COPY --from=build /app/dist /srv
