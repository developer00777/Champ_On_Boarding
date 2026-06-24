# Build stage
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV RAILWAY=true
RUN npm run build

# Runtime stage — production deps only
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/build ./build
COPY --from=builder /app/scripts ./scripts
RUN chmod +x scripts/start.sh
CMD ["sh", "scripts/start.sh"]
