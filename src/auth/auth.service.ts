import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { textoSeguroParaLog } from '../common/logging/client-ip';

export interface JwtPayload {
  sub: number; // usuario_id
  usuarioId: number;
  moradorId: number | null;
  usuarioPerfil: 'SINDICO' | 'MORADOR';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // `ip` serve só para o log (quem, o quê, quando e de onde). A senha NUNCA vai para o log.
  async login(dto: LoginDto, ip = '-') {
    const login = textoSeguroParaLog(dto.usuarioLogin);
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioLogin: dto.usuarioLogin },
    });

    if (!usuario || usuario.usuarioStatus !== 1) {
      this.logger.warn(`Falha de login | usuario=${login} | motivo=usuário inexistente ou inativo | ip=${ip}`);
      throw new UnauthorizedException('Login ou senha inválidos.');
    }

    const senhaValida = await bcrypt.compare(
      dto.senha,
      usuario.usuarioSenhaHash,
    );
    if (!senhaValida) {
      this.logger.warn(`Falha de login | usuario=${login} | motivo=senha incorreta | ip=${ip}`);
      throw new UnauthorizedException('Login ou senha inválidos.');
    }

    const moradorId = await this.resolverMoradorId(usuario.usuarioId);

    await this.prisma.usuario.update({
      where: { usuarioId: usuario.usuarioId },
      data: { usuarioUltimoAcesso: new Date() },
    });

    this.logger.log(`Login realizado | usuario=${login} | id=${usuario.usuarioId} | perfil=${usuario.usuarioPerfil} | ip=${ip}`);

    const payload: JwtPayload = {
      sub: usuario.usuarioId,
      usuarioId: usuario.usuarioId,
      moradorId,
      usuarioPerfil: usuario.usuarioPerfil,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      usuario: {
        usuarioId: usuario.usuarioId,
        usuarioLogin: usuario.usuarioLogin,
        usuarioPerfil: usuario.usuarioPerfil,
        moradorId,
      },
    };
  }

  private async resolverMoradorId(usuarioId: number): Promise<number | null> {
    const vinculo = await this.prisma.moradorImovel.findFirst({
      where: { usuarioId },
      select: { moradorId: true },
    });
    return vinculo?.moradorId ?? null;
  }
}
