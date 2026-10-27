# Backend Dockerfile
FROM node:20-alpine AS base

# Install dependencies
RUN apk add --no-cache python3 make g++ sqlite-libs

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy package workspaces
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/database/src ./packages/database/src
COPY packages/database/tsconfig.json ./packages/database/
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/

# Build packages
RUN npm run build --workspaces --if-present

# Production stage
FROM node:20-alpine AS production

RUN apk add --no-cache sqlite-libs

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./

# Copy package workspaces
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY packages/backend/package.json ./packages/backend/

# Install production dependencies only
RUN npm ci --workspaces --include-workspace-root --omit=dev

# Copy built files
COPY --from=base /app/packages/core/dist ./packages/core/dist
COPY --from=base /app/packages/database/dist ./packages/database/dist
COPY --from=base /app/packages/backend/dist ./packages/backend/dist

# Create data directory
RUN mkdir -p /data

# Expose ports
EXPOSE 3000 3001

# Start server
CMD ["node", "packages/backend/dist/index.js"]