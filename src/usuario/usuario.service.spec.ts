import { ConflictException, NotFoundException } from '@nestjs/common';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { UsuarioService } from './usuario.service';

describe('UsuarioService.create com moradorImovelId', () => {
  let prisma: any;
  let service: UsuarioService;
  const dto = { usuarioLogin: 'ana', senha: 'Senha@1234', moradorImovelId: 5 } as any;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UsuarioService(prisma);
    prisma.usuario.create.mockResolvedValue({ usuarioId: 9, usuarioLogin: 'ana' });
  });

  it('vincula o novo usuário à relação', async () => {
    prisma.moradorImovel.findUnique.mockResolvedValue({ usuario: null });
    await service.create(dto);
    expect(prisma.moradorImovel.update).toHaveBeenCalledWith({
      where: { moradorImovelId: 5 },
      data: { usuarioId: 9 },
    });
  });

  it('relação inexistente → 404 amigável (e nada é vinculado)', async () => {
    prisma.moradorImovel.findUnique.mockResolvedValue(null);
    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.moradorImovel.update).not.toHaveBeenCalled();
  });

  it('relação que já tem conta ativa → 409', async () => {
    prisma.moradorImovel.findUnique.mockResolvedValue({ usuario: { usuarioLogin: 'joao', usuarioStatus: 1 } });
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.moradorImovel.update).not.toHaveBeenCalled();
  });

  it('relação cuja conta anterior foi revogada aceita uma nova conta', async () => {
    prisma.moradorImovel.findUnique.mockResolvedValue({ usuario: { usuarioLogin: 'joao', usuarioStatus: 0 } });
    await service.create(dto);
    expect(prisma.moradorImovel.update).toHaveBeenCalled();
  });
});
