import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { MoradorService } from './morador.service';

describe('MoradorService', () => {
  let prisma: any;
  let events: any;
  let service: MoradorService;

  beforeEach(() => {
    prisma = createPrismaMock();
    events = { publish: jest.fn() };
    service = new MoradorService(prisma, events);
  });

  describe('create', () => {
    it('aplica moradorStatus = 1 por padrão e publica morador.cadastrado', async () => {
      prisma.morador.create.mockResolvedValue({ moradorId: 7, moradorNome: 'Ana', moradorStatus: 1 });

      await service.create({ moradorNome: 'Ana', moradorCpf: '11122233344' } as any);

      expect(prisma.morador.create.mock.calls[0][0].data).toMatchObject({ moradorStatus: 1 });
      expect(events.publish).toHaveBeenCalledWith('morador.cadastrado', {
        moradorId: 7,
        moradorNome: 'Ana',
        moradorStatus: 1,
      });
    });

    it('respeita o moradorStatus enviado', async () => {
      prisma.morador.create.mockResolvedValue({ moradorId: 8, moradorNome: 'B', moradorStatus: 0 });

      await service.create({ moradorNome: 'B', moradorCpf: '11122233344', moradorStatus: 0 } as any);

      expect(prisma.morador.create.mock.calls[0][0].data.moradorStatus).toBe(0);
    });

    it('converte moradorDataNascimento (string) em Date', async () => {
      prisma.morador.create.mockResolvedValue({ moradorId: 1 });

      await service.create({
        moradorNome: 'Ana',
        moradorCpf: '11122233344',
        moradorDataNascimento: '1990-05-14',
      } as any);

      expect(prisma.morador.create.mock.calls[0][0].data.moradorDataNascimento).toBeInstanceOf(Date);
    });

    it('traduz CPF/e-mail duplicado (P2002) em 409 e não publica evento', async () => {
      prisma.morador.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['uk_morador_cpf'] },
        }),
      );

      await expect(
        service.create({ moradorNome: 'Ana', moradorCpf: '11122233344' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('update (PATCH)', () => {
    it('envia ao banco SOMENTE os campos recebidos — não reaplica valores padrão', async () => {
      prisma.morador.findUnique.mockResolvedValue({ moradorId: 7 });
      prisma.morador.update.mockResolvedValue({ moradorId: 7 });

      await service.update(7, { moradorTelefone: '(21) 98888-7777' } as any);

      const { data } = prisma.morador.update.mock.calls[0][0];
      expect(data.moradorTelefone).toBe('(21) 98888-7777');
      // regressão: um PATCH parcial chegou a zerar o status para o valor padrão
      expect(data).not.toHaveProperty('moradorStatus', 1);
      expect(Object.keys(data).filter((k) => data[k] !== undefined)).toEqual(['moradorTelefone']);
    });

    it('404 quando o morador não existe', async () => {
      prisma.morador.findUnique.mockResolvedValue(null);

      await expect(service.update(99, { moradorNome: 'X' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.morador.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('é exclusão lógica: apenas muda moradorStatus para 0', async () => {
      prisma.morador.findUnique.mockResolvedValue({ moradorId: 7 });
      prisma.morador.update.mockResolvedValue({ moradorId: 7, moradorStatus: 0 });

      await service.remove(7);

      expect(prisma.morador.update).toHaveBeenCalledWith({
        where: { moradorId: 7 },
        data: { moradorStatus: 0 },
      });
    });
  });

  describe('findAll', () => {
    it('pagina (padrão 1/20), filtra por status e busca em nome, CPF e e-mail', async () => {
      prisma.morador.findMany.mockResolvedValue([{ moradorId: 1 }]);
      prisma.morador.count.mockResolvedValue(45);

      const res = await service.findAll({ status: 1, busca: 'ana' });

      expect(res).toMatchObject({ total: 45, page: 1, pageSize: 20, totalPages: 3 });
      const args = prisma.morador.findMany.mock.calls[0][0];
      expect(args).toMatchObject({ skip: 0, take: 20 });
      expect(args.where.moradorStatus).toBe(1);
      expect(args.where.OR).toHaveLength(3);
    });

    it('calcula o skip a partir de page e pageSize', async () => {
      prisma.morador.findMany.mockResolvedValue([]);
      prisma.morador.count.mockResolvedValue(0);

      await service.findAll({ page: 3, pageSize: 10 });

      expect(prisma.morador.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
    });
  });
});
