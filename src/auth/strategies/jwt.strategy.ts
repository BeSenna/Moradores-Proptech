import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';

// Lê o header "Authorization: Bearer <token>", valida a assinatura e
// injeta o payload decodificado em req.user — usado por todas as rotas protegidas.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'troque-por-um-segredo-forte-e-unico',
    });
  }

  // Além da assinatura/expiração, confere o usuário no banco a cada requisição:
  // se a conta foi desativada (usuario_status = 0) ou apagada, o token já emitido
  // deixa de valer imediatamente — sem esperar os 8h de validade.
  // O perfil também é lido do banco, então rebaixar um SINDICO tem efeito na hora.
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { usuarioId: payload.usuarioId },
      select: { usuarioStatus: true, usuarioPerfil: true },
    });

    if (!usuario || usuario.usuarioStatus !== 1) {
      throw new UnauthorizedException('Acesso revogado ou usuário inativo.');
    }

    // o que for retornado aqui vira req.user
    return { ...payload, usuarioPerfil: usuario.usuarioPerfil };
  }
}
