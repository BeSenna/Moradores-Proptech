import { UnauthorizedException } from '@nestjs/common';
import { createPrismaMock } from '../../../test/helpers/prisma-mock';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate — revogação de tokens já emitidos', () => {
  const payload: any = { sub: 5, usuarioId: 5, moradorId: 7, usuarioPerfil: 'SINDICO' };
  let prisma: any;
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = createPrismaMock();
    strategy = new JwtStrategy(prisma);
  });

  it('aceita o token de um usuário ativo e devolve o payload', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ usuarioStatus: 1, usuarioPerfil: 'SINDICO' });

    await expect(strategy.validate(payload)).resolves.toEqual(payload);
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuarioId: 5 } }),
    );
  });

  it('rejeita o token quando o usuário foi desativado (usuario_status = 0)', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ usuarioStatus: 0, usuarioPerfil: 'SINDICO' });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita o token quando o usuário não existe mais', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usa o perfil atual do banco, não o que está gravado no token', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ usuarioStatus: 1, usuarioPerfil: 'MORADOR' });

    const user = await strategy.validate(payload);

    expect(user.usuarioPerfil).toBe('MORADOR');
  });
});
