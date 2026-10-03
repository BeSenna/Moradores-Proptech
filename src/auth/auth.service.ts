import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: number; // usuario_id
  usuarioId: number;
  moradorId: number | null;
  usuarioPerfil: 'SINDICO' | 'MORADOR';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioLogin: dto.usuarioLogin },
    });

    if (!usuario || usuario.usuarioStatus !== 1) {
      throw new UnauthorizedException('Login ou senha inválidos.');
    }

    const senhaValida = await bcrypt.compare(
      dto.senha,
      usuario.usuarioSenhaHash,
    );
    if (!senhaValida) {
      throw new UnauthorizedException('Login ou senha inválidos.');
    }

    // Diferente de um link direto usuario -> morador, o morador_id é resolvido
    // consultando qual(is) linha(s) de morador_imovel referenciam este usuario_id
    // (ver seção "Autenticação e Autorização" da arquitetura do sistema).
    const moradorId = await this.resolverMoradorId(usuario.usuarioId);

    await this.prisma.usuario.update({
      where: { usuarioId: usuario.usuarioId },
      data: { usuarioUltimoAcesso: new Date() },
    });

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
