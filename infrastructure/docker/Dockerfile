# syntax=docker/dockerfile:1
# Builds one service image from the monorepo:
#   docker build -f infrastructure/docker/Dockerfile --build-arg APP=incident-service -t uap/incident-service .
# Not used by docker-compose.yml (which only runs infrastructure); intended for CI/deployment.

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
# node images ship with Yarn 1.22 (classic).
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM deps AS build
ARG APP
RUN test -n "$APP" || (echo "APP build arg is required" && exit 1)
COPY . .
RUN yarn prisma generate && yarn nest build "$APP"

FROM base AS runtime
ARG APP
ENV NODE_ENV=production
# Every service listens on PORT inside its container (generic PORT is the fallback for <SERVICE>_PORT).
ENV PORT=3000
# The webpack bundle keeps node_modules external, so runtime needs them (incl. generated Prisma client).
# TODO(optimization): prune dev dependencies (keeping the generated Prisma client) to shrink the image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist/apps/${APP} ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
