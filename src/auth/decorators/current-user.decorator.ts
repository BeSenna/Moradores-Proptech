import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../auth.service';

// Uso: create(@CurrentUser() user: JwtPayload) — pega req.user já validado pelo JwtAuthGuard.
// É assim que o morador_id chega nos endpoints de /reserva e /ocorrencia (nos outros
// microsserviços) sem nunca ser aceito no corpo da requisição.
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
