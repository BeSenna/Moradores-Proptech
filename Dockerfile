# Imagem do MS Moradores (NestJS + Prisma)
FROM node:24-slim

# O Prisma precisa do OpenSSL para falar com o MySQL
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) dependências (camada em cache enquanto package*.json não mudar)
COPY package*.json ./
RUN npm ci

# 2) Prisma Client gerado a partir do schema (o Prisma 7 lê a config em prisma.config.ts)
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
# o prisma.config.ts exige DATABASE_URL só para carregar; o generate não conecta no banco
RUN DATABASE_URL="mysql://u:p@localhost:3306/db" npx prisma generate

# 3) código + build
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

# aplica as migrations no banco e sobe a API (que cria o síndico inicial, se preciso)
CMD ["sh", "docker/entrypoint.sh"]