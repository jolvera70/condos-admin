# ===== build stage: exporta la web estatica de Expo =====
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Dependencias primero (cachea si package*.json no cambia)
COPY package.json package-lock.json ./
RUN npm ci
# Codigo + export web. Usa las EXPO_PUBLIC_* del .env (API de produccion).
COPY . .
RUN npx expo export -p web

# ===== runtime stage: nginx sirve dist/ =====
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
