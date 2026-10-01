# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# The browser bundle uses onnxruntime-web. Skipping lifecycle scripts avoids
# downloading the unused native onnxruntime-node binary during image builds.
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
