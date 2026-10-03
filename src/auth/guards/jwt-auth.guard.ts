import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Aplicado nas rotas que exigem Authorization: Bearer <token>.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
