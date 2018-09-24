FROM node

WORKDIR /home/node/app

ADD index.mjs .
ADD package.json .

RUN npm install

EXPOSE 3005

CMD ["npm", "start"]
