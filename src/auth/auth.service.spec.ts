import { Logger, UnauthorizedException } from '@nestjs/common';
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

  it('coloca no token os imóveis das relações ainda vigentes (sem repetir)', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario);
    prisma.moradorImovel.findFirst.mockResolvedValue({ moradorId: 7 });
    prisma.moradorImovel.findMany.mockResolvedValue([{ imovelId: 3 }, { imovelId: 4 }, { imovelId: 3 }]);

    await service.login({ usuarioLogin: 'ana', senha: 'senha1234' });

    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ imovelIds: [3, 4] }));
    const { where } = prisma.moradorImovel.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ usuarioId: 42, moradorImovelStatus: 1 });
    expect(where.OR).toEqual([{ moradorImovelDataFim: null }, { moradorImovelDataFim: { gt: expect.any(Date) } }]);
  });

  it('síndico não consulta imóveis e leva lista vazia', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ ...usuario, usuarioPerfil: 'SINDICO' });

    await service.login({ usuarioLogin: 'ana', senha: 'senha1234' });

    expect(prisma.moradorImovel.findMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ imovelIds: [] }));
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
  describe('logs de login (quem, o quê, de onde — nunca a senha)', () => {
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
      log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });
    afterEach(() => jest.restoreAllMocks());

    it('registra o login realizado com usuário, perfil e IP', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuario);
      prisma.moradorImovel.findFirst.mockResolvedValue({ moradorId: 7 });

      await service.login({ usuarioLogin: 'ana', senha: 'senha1234' }, '192.168.0.12');

      expect(log).toHaveBeenCalledWith('Login realizado | usuario=ana | id=42 | perfil=MORADOR | ip=192.168.0.12');
    });

    it('registra a falha por senha incorreta, sem gravar a senha digitada', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuario);

      await expect(service.login({ usuarioLogin: 'ana', senha: 'SenhaErrada@1' }, '10.0.0.7')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      const linha = warn.mock.calls[0][0] as string;
      expect(linha).toBe('Falha de login | usuario=ana | motivo=senha incorreta | ip=10.0.0.7');
      expect(linha).not.toContain('SenhaErrada');
    });

    it('registra a falha de usuário inexistente e não deixa o login forjar linhas de log', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.login({ usuarioLogin: 'x\nLogin realizado | usuario=admin', senha: 'qualquer1!' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      const linha = warn.mock.calls[0][0] as string;
      expect(linha).not.toContain('\n');
      expect(linha).toContain('motivo=usuário inexistente ou inativo');
      expect(linha).toContain('ip=-');
    });
  });
});
