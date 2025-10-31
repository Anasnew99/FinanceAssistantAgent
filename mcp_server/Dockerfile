FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN yarn install --only=production
COPY . .
RUN yarn build
EXPOSE 3000
CMD ["yarn", "start"]
