FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE ${MEDIA_PORT:-3011}

CMD ["npm", "run", "media"]