# Stage 1: Build
FROM node:20-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-workspace.yaml ./

RUN pnpm install --no-frozen-lockfile

# Copy source
COPY . .

# Build args for Vite env vars (baked in at build time)
ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_USE_MOCK_AUTH=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_USE_MOCK_AUTH=$VITE_USE_MOCK_AUTH

RUN pnpm build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
