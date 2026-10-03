import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';

// Lê o header "Authorization: Bearer <token>", valida a assinatura e
// injeta o payload decodificado em req.user — usado por todas as rotas protegidas.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'troque-por-um-segredo-forte-e-unico',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // o que for retornado aqui vira req.user
    return payload;
  }
}
