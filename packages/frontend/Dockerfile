# Frontend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy package workspaces
COPY packages/core/package.json ./packages/core/
COPY packages/frontend/package.json ./packages/frontend/

# Install dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/frontend/src ./packages/frontend/src
COPY packages/frontend/tsconfig.json ./packages/frontend/
COPY packages/frontend/tsconfig.node.json ./packages/frontend/
COPY packages/frontend/vite.config.ts ./packages/frontend/
COPY packages/frontend/tailwind.config.js ./packages/frontend/
COPY packages/frontend/postcss.config.js ./packages/frontend/
COPY packages/frontend/index.html ./packages/frontend/
COPY packages/frontend/public ./packages/frontend/public

# Build frontend
RUN npm run build --filter=@pospro/frontend

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Copy built assets
COPY --from=base /app/packages/frontend/dist /usr/share/nginx/html

# Copy nginx config
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]