FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY build.mjs server.mjs ./
COPY public ./public
COPY content ./content
COPY data-src ./data-src

# 站点数据由 content/ 生成，构建时跑一次
RUN node build.mjs

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.mjs"]
