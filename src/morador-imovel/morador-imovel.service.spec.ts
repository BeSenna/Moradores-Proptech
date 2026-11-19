import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { MoradorImovelService } from './morador-imovel.service';

describe('MoradorImovelService', () => {
  let prisma: any;
  let events: any;
  let service: MoradorImovelService;

  const vinculo = (extra: any = {}) => ({
    moradorImovelId: 15,
    moradorId: 7,
    imovelId: 3,
    moradorImovelTipoRelacao: 'PROPRIETARIO',
    moradorImovelDataInicio: new Date('2021-03-12'),
    moradorImovelDataFim: null,
    moradorImovelStatus: 1,
    usuarioId: null,
    ...extra,
  });

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-19T15:00:00Z') });
    prisma = createPrismaMock();
    events = { publish: jest.fn() };
    service = new MoradorImovelService(prisma, events);
    prisma.morador.findUnique.mockResolvedValue({ moradorId: 7 });
    prisma.imovel.findUnique.mockResolvedValue({ imovelId: 3 });
  });

  afterEach(() => jest.useRealTimers());

  describe('estado derivado (não é coluna do banco)', () => {
    const estadoPara = async (dataFim: Date | null) => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo({ moradorImovelDataFim: dataFim }));
      return (await service.findOne(15)).estado;
    };

    it('ATIVO quando não há data de fim', async () => {
      expect(await estadoPara(null)).toBe('ATIVO');
    });

    it('ENCERRANDO quando a data de fim ainda está no futuro', async () => {
      expect(await estadoPara(new Date('2026-12-31'))).toBe('ENCERRANDO');
    });

    it('ENCERRADO quando a data de fim já passou', async () => {
      expect(await estadoPara(new Date('2025-06-10'))).toBe('ENCERRADO');
    });
  });

  describe('create', () => {
    const dto = {
      moradorId: 7,
      imovelId: 3,
      moradorImovelTipoRelacao: 'PROPRIETARIO',
      moradorImovelDataInicio: '2021-03-12',
    } as any;

    it.each(['PROPRIETARIO', 'INQUILINO'])(
      'publica morador_imovel.vinculado para %s (habilita cobrança no Financeiro)',
      async (tipo) => {
        prisma.moradorImovel.create.mockResolvedValue(vinculo({ moradorImovelTipoRelacao: tipo }));

        await service.create({ ...dto, moradorImovelTipoRelacao: tipo });

        expect(events.publish).toHaveBeenCalledWith(
          'morador_imovel.vinculado',
          expect.objectContaining({ moradorImovelId: 15, tipoRelacao: tipo }),
        );
      },
    );

    it.each(['MORADOR', 'TEMPORADA'])('NÃO publica evento para %s', async (tipo) => {
      prisma.moradorImovel.create.mockResolvedValue(vinculo({ moradorImovelTipoRelacao: tipo }));

      await service.create({ ...dto, moradorImovelTipoRelacao: tipo });

      expect(events.publish).not.toHaveBeenCalled();
    });

    it('409 quando a data de fim é anterior à de início', async () => {
      await expect(
        service.create({ ...dto, moradorImovelDataFim: '2020-01-01' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.moradorImovel.create).not.toHaveBeenCalled();
    });

    it('404 quando o morador não existe', async () => {
      prisma.morador.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 quando o imóvel não existe', async () => {
      prisma.imovel.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 para relação duplicada (mesmo morador, imóvel e tipo)', async () => {
      prisma.moradorImovel.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('converte as datas para Date e usa status 1 por padrão', async () => {
      prisma.moradorImovel.create.mockResolvedValue(vinculo());

      await service.create(dto);

      const { data } = prisma.moradorImovel.create.mock.calls[0][0];
      expect(data.moradorImovelDataInicio).toBeInstanceOf(Date);
      expect(data.moradorImovelStatus).toBe(1);
    });

    describe('login herdado entre as relações da mesma pessoa', () => {
      it('herda a conta ativa que o morador já usa em outra relação', async () => {
        prisma.moradorImovel.findFirst.mockResolvedValue({ usuarioId: 42 });
        prisma.moradorImovel.create.mockResolvedValue(vinculo({ usuarioId: 42 }));

        await service.create(dto);

        expect(prisma.moradorImovel.findFirst.mock.calls[0][0].where).toEqual({
          moradorId: 7,
          usuarioId: { not: null },
          usuario: { usuarioStatus: 1 },
        });
        expect(prisma.moradorImovel.create.mock.calls[0][0].data.usuarioId).toBe(42);
      });

      it('não envia usuarioId quando o morador ainda não tem conta ativa', async () => {
        prisma.moradorImovel.findFirst.mockResolvedValue(null);
        prisma.moradorImovel.create.mockResolvedValue(vinculo());

        await service.create(dto);

        expect(prisma.moradorImovel.create.mock.calls[0][0].data).not.toHaveProperty('usuarioId');
      });
    });

    describe('combinação de tipos no mesmo imóvel', () => {
      const existente = (tipo: string, dataFim: Date | null = null) => [
        { moradorImovelTipoRelacao: tipo, moradorImovelDataFim: dataFim },
      ];

      it.each([
        ['PROPRIETARIO', 'MORADOR'],
        ['MORADOR', 'PROPRIETARIO'],
      ])('permite %s já existente + %s novo (dono que também mora)', async (atual, novo) => {
        prisma.moradorImovel.findMany.mockResolvedValue(existente(atual));
        prisma.moradorImovel.create.mockResolvedValue(vinculo({ moradorImovelTipoRelacao: novo }));

        await service.create({ ...dto, moradorImovelTipoRelacao: novo });

        expect(prisma.moradorImovel.create).toHaveBeenCalled();
      });

      it.each([
        ['PROPRIETARIO', 'INQUILINO'],
        ['INQUILINO', 'PROPRIETARIO'],
        ['PROPRIETARIO', 'TEMPORADA'],
        ['TEMPORADA', 'PROPRIETARIO'],
        ['INQUILINO', 'MORADOR'],
        ['MORADOR', 'INQUILINO'],
        ['MORADOR', 'TEMPORADA'],
        ['TEMPORADA', 'MORADOR'],
        ['INQUILINO', 'TEMPORADA'],
        ['TEMPORADA', 'INQUILINO'],
      ])('409 para %s já existente + %s novo', async (atual, novo) => {
        prisma.moradorImovel.findMany.mockResolvedValue(existente(atual));

        await expect(
          service.create({ ...dto, moradorImovelTipoRelacao: novo }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.moradorImovel.create).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
      });

      it('a mensagem de erro diz qual é a única combinação permitida', async () => {
        prisma.moradorImovel.findMany.mockResolvedValue(existente('PROPRIETARIO'));

        await expect(
          service.create({ ...dto, moradorImovelTipoRelacao: 'INQUILINO' }),
        ).rejects.toThrow(/Proprietário \+ Morador/);
      });

      it('só olha relações ativas do mesmo morador e do mesmo imóvel', async () => {
        prisma.moradorImovel.create.mockResolvedValue(vinculo());

        await service.create(dto);

        expect(prisma.moradorImovel.findMany.mock.calls[0][0].where).toEqual({
          moradorId: 7,
          imovelId: 3,
          moradorImovelStatus: 1,
        });
      });

      it('ignora relação já encerrada (o histórico não impede um novo tipo)', async () => {
        prisma.moradorImovel.findMany.mockResolvedValue(existente('INQUILINO', new Date('2025-06-10')));
        prisma.moradorImovel.create.mockResolvedValue(vinculo());

        await service.create(dto);

        expect(prisma.moradorImovel.create).toHaveBeenCalled();
      });

      it('relação que ainda está ENCERRANDO (fim no futuro) continua valendo', async () => {
        prisma.moradorImovel.findMany.mockResolvedValue(existente('INQUILINO', new Date('2026-12-31')));

        await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
      });

      it('não valida quando a nova relação já nasce inativa', async () => {
        prisma.moradorImovel.create.mockResolvedValue(vinculo({ moradorImovelStatus: 0 }));

        await service.create({ ...dto, moradorImovelStatus: 0 });

        expect(prisma.moradorImovel.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('encerrar', () => {
    it('define a data de fim', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo());
      prisma.moradorImovel.update.mockResolvedValue(
        vinculo({ moradorImovelDataFim: new Date('2026-12-31') }),
      );

      const res = await service.encerrar(15, { moradorImovelDataFim: '2026-12-31' });

      expect(prisma.moradorImovel.update).toHaveBeenCalledWith({
        where: { moradorImovelId: 15 },
        data: { moradorImovelDataFim: new Date('2026-12-31') },
      });
      expect(res.estado).toBe('ENCERRANDO');
    });

    it('409 quando a data de fim é anterior ao início do vínculo', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo());

      await expect(
        service.encerrar(15, { moradorImovelDataFim: '2020-01-01' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.moradorImovel.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('é exclusão lógica (status 0)', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo());
      prisma.moradorImovel.update.mockResolvedValue(vinculo({ moradorImovelStatus: 0 }));

      await service.remove(15);

      expect(prisma.moradorImovel.update).toHaveBeenCalledWith({
        where: { moradorImovelId: 15 },
        data: { moradorImovelStatus: 0 },
      });
    });
  });

  describe('update — reabrir o vínculo', () => {
    it('data_fim = null limpa a data de fim no banco', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo({ moradorImovelDataFim: new Date('2026-10-01') }));
      prisma.moradorImovel.update.mockResolvedValue(vinculo());

      await service.update(15, { moradorImovelDataFim: null });

      expect(prisma.moradorImovel.update.mock.calls[0][0].data.moradorImovelDataFim).toBeNull();
    });

    it('data_fim ausente não altera a data de fim', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo());
      prisma.moradorImovel.update.mockResolvedValue(vinculo());

      await service.update(15, { moradorImovelStatus: 1 });

      expect(prisma.moradorImovel.update.mock.calls[0][0].data.moradorImovelDataFim).toBeUndefined();
    });
  });

  describe('update — combinação de tipos e troca de morador', () => {
    const outraAtiva = (tipo: string) => [{ moradorImovelTipoRelacao: tipo, moradorImovelDataFim: null }];

    it('409 ao trocar o tipo para um que não combina com outra relação ativa do imóvel', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo({ moradorImovelTipoRelacao: 'MORADOR' }));
      prisma.moradorImovel.findMany.mockResolvedValue(outraAtiva('PROPRIETARIO'));

      await expect(
        service.update(15, { moradorImovelTipoRelacao: 'INQUILINO' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.moradorImovel.update).not.toHaveBeenCalled();
    });

    it('não conta a própria relação ao validar', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo());
      prisma.moradorImovel.update.mockResolvedValue(vinculo());

      await service.update(15, { moradorImovelDataInicio: '2021-04-01' });

      expect(prisma.moradorImovel.findMany.mock.calls[0][0].where).toEqual({
        moradorId: 7,
        imovelId: 3,
        moradorImovelStatus: 1,
        moradorImovelId: { not: 15 },
      });
    });

    it('permite trocar para MORADOR quando a outra relação ativa é PROPRIETARIO', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo({ moradorImovelTipoRelacao: 'INQUILINO' }));
      prisma.moradorImovel.findMany.mockResolvedValue(outraAtiva('PROPRIETARIO'));
      prisma.moradorImovel.update.mockResolvedValue(vinculo({ moradorImovelTipoRelacao: 'MORADOR' }));

      await service.update(15, { moradorImovelTipoRelacao: 'MORADOR' });

      expect(prisma.moradorImovel.update).toHaveBeenCalled();
    });

    it('reabrir uma relação encerrada também revalida a combinação', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(
        vinculo({ moradorImovelTipoRelacao: 'INQUILINO', moradorImovelDataFim: new Date('2026-01-10') }),
      );
      prisma.moradorImovel.findMany.mockResolvedValue(outraAtiva('PROPRIETARIO'));

      await expect(service.update(15, { moradorImovelDataFim: null })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('editar uma relação já encerrada não é bloqueado', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(
        vinculo({ moradorImovelTipoRelacao: 'INQUILINO', moradorImovelDataFim: new Date('2026-01-10') }),
      );
      prisma.moradorImovel.update.mockResolvedValue(vinculo());

      await service.update(15, { moradorImovelDataInicio: '2021-04-01' });

      expect(prisma.moradorImovel.findMany).not.toHaveBeenCalled();
    });

    it('409 ao transferir para outro morador uma relação que já tem login', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo({ usuarioId: 42 }));
      prisma.morador.findUnique.mockResolvedValue({ moradorId: 8 });

      await expect(service.update(15, { moradorId: 8 })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.moradorImovel.update).not.toHaveBeenCalled();
    });

    it('permite transferir para outro morador uma relação sem login', async () => {
      prisma.moradorImovel.findUnique.mockResolvedValue(vinculo());
      prisma.morador.findUnique.mockResolvedValue({ moradorId: 8 });
      prisma.moradorImovel.update.mockResolvedValue(vinculo({ moradorId: 8 }));

      await service.update(15, { moradorId: 8 });

      expect(prisma.moradorImovel.update).toHaveBeenCalled();
    });
  });
});
