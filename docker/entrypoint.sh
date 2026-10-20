#!/bin/sh
set -e

echo ">> Criando/atualizando as tabelas no banco (prisma db push)..."
npx prisma db push --skip-generate

echo ">> Garantindo o usuário síndico inicial..."
node prisma/seed.js

echo ">> Iniciando o MS Moradores..."
exec node dist/src/main
