import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Uso: @Roles('SINDICO') em cima de um controller ou de uma rota específica.
export const Roles = (...roles: Array<'SINDICO' | 'MORADOR'>) =>
  SetMetadata(ROLES_KEY, roles);
