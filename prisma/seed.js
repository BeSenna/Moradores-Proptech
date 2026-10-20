// Cria o primeiro usuário SINDICO (se ainda não existir), para dar acesso à API logo no primeiro start.
// Login/senha vêm de ADMIN_LOGIN / ADMIN_SENHA (padrão: admin / Admin@12345).
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  const login = process.env.ADMIN_LOGIN || 'admin';
  const senha = process.env.ADMIN_SENHA || 'Admin@12345';
  try {
    const existente = await prisma.usuario.findUnique({ where: { usuarioLogin: login } });
    if (existente) {
      console.log(`   usuário "${login}" já existe — nada a fazer.`);
      return;
    }
    await prisma.usuario.create({
      data: {
        usuarioLogin: login,
        usuarioSenhaHash: await bcrypt.hash(senha, 10),
        usuarioPerfil: 'SINDICO',
        usuarioStatus: 1,
      },
    });
    console.log(`   usuário síndico "${login}" criado.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Falha no seed:', e);
  process.exit(1);
});
