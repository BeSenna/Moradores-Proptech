# Imagem do MS Moradores (NestJS + Prisma)
FROM node:20-slim

# O Prisma precisa do OpenSSL para falar com o MySQL
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) dependências (camada em cache enquanto package*.json não mudar)
COPY package*.json ./
RUN npm ci

# 2) Prisma Client gerado a partir do schema
COPY prisma ./prisma
RUN npx prisma generate

# 3) código + build
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

# aplica as migrations no banco e sobe a API (que cria o síndico inicial, se preciso)
CMD ["sh", "docker/entrypoint.sh"]
