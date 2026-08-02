FROM node:22-alpine

ENV NODE_ENV=production \
    DATA_DIR=/data

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./
RUN mkdir -p /data && chown -R node:node /data /app/backend

USER node
EXPOSE 3001 3002
CMD ["node", "index.js"]

