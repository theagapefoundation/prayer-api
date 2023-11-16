FROM node:lts-alpine

WORKDIR /app

COPY . .

RUN yarn --proudction

RUN yarn build

EXPOSE ${PORT}

CMD ["yarn", "start:prod"]
