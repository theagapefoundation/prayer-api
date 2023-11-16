FROM node:lts-alpine

WORKDIR /app

COPY . .

RUN yarn --proudction

RUN yarn build

EXPOSE ${PORT}

CMD ["npm", "start:prod"]