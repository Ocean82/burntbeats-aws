FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

RUN mkdir -p /app/tmp/stems

EXPOSE 3001
CMD ["node", "server.js"]

