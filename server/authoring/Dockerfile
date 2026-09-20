FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 AUTHORING_LISTEN_HOST=0.0.0.0
WORKDIR /app
COPY server/authoring/runtime/package.json server/authoring/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server/authoring/*.mjs ./server/authoring/
COPY src/lib/authoringCore/ ./src/lib/authoringCore/
USER node
EXPOSE 8080
CMD ["node", "server/authoring/start.mjs"]
