import * as bcrypt from 'bcryptjs';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { AdminBootstrapService } from './admin-bootstrap.service';

describe('AdminBootstrapService — síndico inicial automático', () => {
  let prisma: any;
  let service: AdminBootstrapService;
  const envOriginal = { ...process.env };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AdminBootstrapService(prisma);
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    delete process.env.ADMIN_LOGIN;
    delete process.env.ADMIN_SENHA;
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it('cria o síndico quando não há nenhum ativo e ADMIN_SENHA está definida', async () => {
    process.env.ADMIN_LOGIN = 'chefe';
    process.env.ADMIN_SENHA = 'SenhaForte123';
    prisma.usuario.count.mockResolvedValue(0);

    await service.onApplicationBootstrap();

    expect(prisma.usuario.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.usuario.create.mock.calls[0][0];
    expect(data).toMatchObject({ usuarioLogin: 'chefe', usuarioPerfil: 'SINDICO', usuarioStatus: 1 });
    // grava só o hash, nunca a senha em texto puro
    expect(data.usuarioSenhaHash).not.toBe('SenhaForte123');
    expect(await bcrypt.compare('SenhaForte123', data.usuarioSenhaHash)).toBe(true);
  });

  it('usa "admin" como login quando ADMIN_LOGIN não é informado', async () => {
    process.env.ADMIN_SENHA = 'SenhaForte123';
    prisma.usuario.count.mockResolvedValue(0);

    await service.onApplicationBootstrap();

    expect(prisma.usuario.create.mock.calls[0][0].data.usuarioLogin).toBe('admin');
  });

  it('não faz nada quando já existe um síndico ativo', async () => {
    process.env.ADMIN_SENHA = 'SenhaForte123';
    prisma.usuario.count.mockResolvedValue(1);

    await service.onApplicationBootstrap();

    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('não cria nada sem ADMIN_SENHA, nem com senha curta (< 8 caracteres)', async () => {
    prisma.usuario.count.mockResolvedValue(0);

    await service.onApplicationBootstrap();
    process.env.ADMIN_SENHA = '1234';
    await service.onApplicationBootstrap();

    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('não derruba a API se o banco falhar (ex.: tabelas ainda não criadas)', async () => {
    process.env.ADMIN_SENHA = 'SenhaForte123';
    prisma.usuario.count.mockRejectedValue(new Error('tabela inexistente'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
