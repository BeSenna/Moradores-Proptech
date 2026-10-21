#!/bin/sh
set -e

# As tabelas do banco do servidor são criadas pelo professor (o usuário da aplicação só tem
# SELECT/INSERT/UPDATE/DELETE), então não rodamos `prisma migrate deploy` aqui.
# O síndico inicial (ADMIN_LOGIN / ADMIN_SENHA) é criado pela própria API ao subir,
# quando ainda não existe nenhum síndico ativo.
echo ">> Iniciando o MS Moradores..."
exec node dist/src/main