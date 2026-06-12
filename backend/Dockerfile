FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . ./

RUN mkdir -p /app/tmp/stems /app/tmp/speech /app/tmp/midi

RUN addgroup -g 10001 -S appuser \
    && adduser -u 10001 -S -G appuser appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 3001
CMD ["node", "server.js"]
