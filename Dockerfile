FROM node:lts

WORKDIR /app

COPY . .

RUN npm install

RUN npm install pm2 -g

RUN npm run build

CMD ["pm2", "start", "dist/main.js"]