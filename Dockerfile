# ---- Stage 1: Build frontend ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ENV VITE_API_URL=/api
RUN npm run build

# ---- Stage 2: API server ----
FROM node:22-alpine AS api
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ .
EXPOSE 4000
CMD ["node", "index.mjs"]

# ---- Stage 3: Nginx serving frontend ----
FROM nginx:alpine AS web
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
