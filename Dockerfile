FROM node:lts-alpine as build

WORKDIR /build

COPY . .

RUN yarn install

ARG SENTRY_AUTH_TOKEN

RUN yarn build

FROM node:lts-alpine as prod

WORKDIR /app

COPY package.json package.json
COPY yarn.lock yarn.lock
RUN yarn install --prod

COPY --from=build /build/dist ./dist

EXPOSE ${PORT}

CMD ["node", "./dist/src/main.js"]
