FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
# MIGRATE_ON_START=true (the default) applies pending database migrations before starting; set it to false to skip.
CMD ["sh", "-c", "if [ \"${MIGRATE_ON_START:-true}\" = \"true\" ]; then npx prisma migrate deploy; fi && npm start"]
