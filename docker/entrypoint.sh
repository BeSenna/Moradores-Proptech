#!/bin/sh
set -e

echo ">> Aplicando as migrations no banco (prisma migrate deploy)..."
npx prisma migrate deploy

# O síndico inicial (ADMIN_LOGIN / ADMIN_SENHA) é criado pela própria API ao subir,
# quando ainda não existe nenhum síndico ativo.
echo ">> Iniciando o MS Moradores..."
exec node dist/src/main
