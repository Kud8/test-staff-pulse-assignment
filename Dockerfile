FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive

FROM dependencies AS build
COPY . .
RUN yarn build

FROM nginx:stable-alpine AS frontend
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

FROM node:24-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --non-interactive && yarn cache clean
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 3001
CMD ["node", "server/index.ts"]
