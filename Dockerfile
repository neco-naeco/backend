FROM node:23-alpine AS base
WORKDIR /app

RUN apk add --no-cache docker-cli
RUN npm install -g pnpm

# ---- deps stage ----
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# ---- build stage ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- development stage ----
FROM deps AS development
COPY . .

ENV NODE_ENV=development
EXPOSE 8080

CMD ["./node_modules/.bin/nest", "start", "--watch"]

# ---- production stage ----
FROM node:23-alpine AS production
WORKDIR /app

RUN apk add --no-cache docker-cli
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY database ./database

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/main"]
