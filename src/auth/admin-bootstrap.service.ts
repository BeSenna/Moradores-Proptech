import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

// Cria automaticamente o primeiro SINDICO quando o sistema sobe sem nenhum síndico ativo.
// Resolve o "ovo e a galinha" de criar usuários (que exige estar logado como síndico).
//
//   ADMIN_LOGIN  — login do síndico inicial (padrão: admin)
//   ADMIN_SENHA  — senha inicial (mín. 8 caracteres). Sem ela, nada é criado.
//
// Só age se NÃO existir síndico ativo; depois do primeiro start não faz mais nada.
// Nunca derruba a API: qualquer falha (ex.: tabelas ainda não criadas) vira só um log.
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const login = process.env.ADMIN_LOGIN || 'admin';
    const senha = process.env.ADMIN_SENHA;

    try {
      const sindicosAtivos = await this.prisma.usuario.count({
        where: { usuarioPerfil: 'SINDICO', usuarioStatus: 1 },
      });
      if (sindicosAtivos > 0) return;

      if (!senha || senha.length < 8) {
        this.logger.warn(
          'Nenhum síndico ativo e ADMIN_SENHA ausente (ou com menos de 8 caracteres): ' +
            'defina ADMIN_LOGIN/ADMIN_SENHA no .env para criar o síndico inicial automaticamente.',
        );
        return;
      }

      await this.prisma.usuario.create({
        data: {
          usuarioLogin: login,
          usuarioSenhaHash: await bcrypt.hash(senha, 10),
          usuarioPerfil: 'SINDICO',
          usuarioStatus: 1,
        },
      });
      this.logger.log(`Síndico inicial "${login}" criado.`);
    } catch (e) {
      this.logger.error(
        `Não foi possível criar o síndico inicial: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
