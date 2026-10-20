import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  let prisma: any;
  let jwt: any;
  let service: AuthService;
  let usuario: any;

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = { signAsync: jest.fn().mockResolvedValue('token-assinado') };
    service = new AuthService(prisma, jwt);
    usuario = {
      usuarioId: 42,
      usuarioLogin: 'ana',
      usuarioSenhaHash: bcrypt.hashSync('senha1234', 4),
      usuarioPerfil: 'MORADOR',
      usuarioStatus: 1,
    };
  });

  it('autentica, resolve o moradorId pelo vínculo e assina o token', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario);
    prisma.moradorImovel.findFirst.mockResolvedValue({ moradorId: 7 });

    const res = await service.login({ usuarioLogin: 'ana', senha: 'senha1234' });

    expect(res.accessToken).toBe('token-assinado');
    expect(res.usuario).toEqual({
      usuarioId: 42,
      usuarioLogin: 'ana',
      usuarioPerfil: 'MORADOR',
      moradorId: 7,
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 42, usuarioId: 42, moradorId: 7, usuarioPerfil: 'MORADOR' }),
    );
    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuarioId: 42 } }),
    );
  });

  it('moradorId fica null quando a conta não tem vínculo', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario);
    prisma.moradorImovel.findFirst.mockResolvedValue(null);

    const res = await service.login({ usuarioLogin: 'ana', senha: 'senha1234' });

    expect(res.usuario.moradorId).toBeNull();
  });

  it('rejeita senha errada', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario);

    await expect(service.login({ usuarioLogin: 'ana', senha: 'errada123' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejeita login inexistente', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);

    await expect(service.login({ usuarioLogin: 'x', senha: 'senha1234' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita usuário desativado, mesmo com a senha certa', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ ...usuario, usuarioStatus: 0 });

    await expect(service.login({ usuarioLogin: 'ana', senha: 'senha1234' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
