FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js billing.js clerkAuth.js usageTokens.js s3Presign.js returnUrl.js stripeRedis.js ./

RUN mkdir -p /app/tmp/stems

EXPOSE 3001
CMD ["node", "server.js"]

