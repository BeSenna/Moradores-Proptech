import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPrismaMock } from './helpers/prisma-mock';

// Testes de ponta a ponta (HTTP): sobem o AppModule inteiro com a mesma configuração de produção
// (ValidationPipe, prefixo /api, guards, Swagger), trocando só o banco e o RabbitMQ por mocks.
describe('MS Moradores (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let events: { publish: jest.Mock };
  let jwt: JwtService;
  let usuarios: Map<number, any>;

  const SINDICO = 1;
  const MORADOR = 2;

  const tokenDe = (usuarioId: number, perfil: 'SINDICO' | 'MORADOR') =>
    jwt.sign({ sub: usuarioId, usuarioId, moradorId: null, usuarioPerfil: perfil });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    prisma = createPrismaMock();
    events = { publish: jest.fn() };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EventsService)
      .useValue(events)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // "tabela" de usuários em memória: login e validação do token consultam o mesmo lugar
    usuarios = new Map<number, any>([
      [SINDICO, { usuarioId: SINDICO, usuarioLogin: 'admin', usuarioPerfil: 'SINDICO', usuarioStatus: 1,
        usuarioSenhaHash: bcrypt.hashSync('Admin@12345', 4) }],
      [MORADOR, { usuarioId: MORADOR, usuarioLogin: 'ana', usuarioPerfil: 'MORADOR', usuarioStatus: 1,
        usuarioSenhaHash: bcrypt.hashSync('senha1234', 4) }],
    ]);
    prisma.usuario.findUnique.mockImplementation(async ({ where }: any) =>
      where.usuarioId !== undefined
        ? (usuarios.get(where.usuarioId) ?? null)
        : ([...usuarios.values()].find((u) => u.usuarioLogin === where.usuarioLogin) ?? null),
    );
    prisma.usuario.update.mockResolvedValue({});
    prisma.moradorImovel.findFirst.mockResolvedValue(null);
  });

  describe('autenticação', () => {
    it('rota protegida sem token → 401', async () => {
      await request(app.getHttpServer()).get('/api/morador').expect(401);
    });

    it('token malformado → 401', async () => {
      await request(app.getHttpServer()).get('/api/morador').set(bearer('lixo')).expect(401);
    });

    it('login correto devolve accessToken e dados do usuário', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuarioLogin: 'admin', senha: 'Admin@12345' })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.usuario).toMatchObject({ usuarioLogin: 'admin', usuarioPerfil: 'SINDICO' });
      expect(res.body.usuario).not.toHaveProperty('usuarioSenhaHash');
    });

    it('o token do login funciona em /auth/me', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuarioLogin: 'admin', senha: 'Admin@12345' });

      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set(bearer(login.body.accessToken))
        .expect(200);

      expect(me.body).toMatchObject({ usuarioId: SINDICO, usuarioPerfil: 'SINDICO' });
    });

    it('senha errada → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuarioLogin: 'admin', senha: 'errada' })
        .expect(401);
    });

    it('corpo do login incompleto → 400', async () => {
      await request(app.getHttpServer()).post('/api/auth/login').send({ usuarioLogin: 'admin' }).expect(400);
    });
  });

  describe('desativação de usuário bloqueia tokens já emitidos', () => {
    it('token válido deixa de funcionar assim que usuario_status vira 0', async () => {
      const token = tokenDe(SINDICO, 'SINDICO');
      await request(app.getHttpServer()).get('/api/auth/me').set(bearer(token)).expect(200);

      usuarios.get(SINDICO).usuarioStatus = 0; // o síndico revoga o acesso

      await request(app.getHttpServer()).get('/api/auth/me').set(bearer(token)).expect(401);
      await request(app.getHttpServer()).get('/api/morador').set(bearer(token)).expect(401);
    });

    it('usuário apagado do banco também perde o acesso', async () => {
      const token = tokenDe(MORADOR, 'MORADOR');
      usuarios.delete(MORADOR);

      await request(app.getHttpServer()).get('/api/auth/me').set(bearer(token)).expect(401);
    });

    it('usuário desativado não consegue mais fazer login', async () => {
      usuarios.get(MORADOR).usuarioStatus = 0;

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuarioLogin: 'ana', senha: 'senha1234' })
        .expect(401);
    });

    it('rebaixar um SINDICO tem efeito imediato (o perfil vem do banco)', async () => {
      const token = tokenDe(SINDICO, 'SINDICO'); // token ainda diz SINDICO
      usuarios.get(SINDICO).usuarioPerfil = 'MORADOR';

      await request(app.getHttpServer())
        .post('/api/morador')
        .set(bearer(token))
        .send({ moradorNome: 'Ana', moradorCpf: '11122233344' })
        .expect(403);
    });
  });

  describe('permissões por perfil', () => {
    it('MORADOR consegue listar moradores (GET) → 200', async () => {
      prisma.morador.findMany.mockResolvedValue([]);
      prisma.morador.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/api/morador')
        .set(bearer(tokenDe(MORADOR, 'MORADOR')))
        .expect(200);

      expect(res.body).toEqual({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    });

    it.each([
      ['POST', '/api/morador', { moradorNome: 'Ana', moradorCpf: '11122233344' }],
      ['PATCH', '/api/morador/1', { moradorNome: 'Ana' }],
      ['DELETE', '/api/morador/1', undefined],
      ['POST', '/api/bloco', { blocoNome: 'A' }],
      ['GET', '/api/usuario', undefined],
    ])('MORADOR em %s %s → 403', async (metodo, url, corpo) => {
      const req = (request(app.getHttpServer()) as any)[metodo.toLowerCase()](url).set(
        bearer(tokenDe(MORADOR, 'MORADOR')),
      );
      await (corpo ? req.send(corpo) : req).expect(403);
    });
  });

  describe('moradores (CRUD como SÍNDICO)', () => {
    const sindico = () => bearer(tokenDe(SINDICO, 'SINDICO'));

    it('POST cria o morador com status 1 e publica o evento', async () => {
      prisma.morador.create.mockResolvedValue({ moradorId: 7, moradorNome: 'Ana', moradorStatus: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/morador')
        .set(sindico())
        .send({ moradorNome: 'Ana', moradorCpf: '11122233344', moradorEmail: 'ana@email.com' })
        .expect(201);

      expect(res.body.moradorId).toBe(7);
      expect(prisma.morador.create.mock.calls[0][0].data.moradorStatus).toBe(1);
      expect(events.publish).toHaveBeenCalledWith('morador.cadastrado', expect.objectContaining({ moradorId: 7 }));
    });

    it('POST com CPF inválido → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/morador')
        .set(sindico())
        .send({ moradorNome: 'Ana', moradorCpf: '123' })
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain('11 dígitos');
      expect(prisma.morador.create).not.toHaveBeenCalled();
    });

    it('POST com campo desconhecido → 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/api/morador')
        .set(sindico())
        .send({ moradorNome: 'Ana', moradorCpf: '11122233344', admin: true })
        .expect(400);
    });

    it('POST com CPF repetido → 409', async () => {
      prisma.morador.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['uk_morador_cpf'] },
        }),
      );

      await request(app.getHttpServer())
        .post('/api/morador')
        .set(sindico())
        .send({ moradorNome: 'Ana', moradorCpf: '11122233344' })
        .expect(409);
    });

    it('PATCH parcial altera só o campo enviado (não reaplica status padrão)', async () => {
      prisma.morador.findUnique.mockResolvedValue({ moradorId: 7 });
      prisma.morador.update.mockResolvedValue({ moradorId: 7, moradorTelefone: '(21) 98888-7777' });

      await request(app.getHttpServer())
        .patch('/api/morador/7')
        .set(sindico())
        .send({ moradorTelefone: '(21) 98888-7777' })
        .expect(200);

      const { data } = prisma.morador.update.mock.calls[0][0];
      expect(Object.keys(data).filter((k) => data[k] !== undefined)).toEqual(['moradorTelefone']);
    });

    it('GET /morador/:id inexistente → 404', async () => {
      prisma.morador.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/api/morador/99').set(sindico()).expect(404);
    });

    it('GET /morador/abc (id inválido) → 400', async () => {
      await request(app.getHttpServer()).get('/api/morador/abc').set(sindico()).expect(400);
    });

    it('DELETE faz exclusão lógica (status 0)', async () => {
      prisma.morador.findUnique.mockResolvedValue({ moradorId: 7 });
      prisma.morador.update.mockResolvedValue({ moradorId: 7, moradorStatus: 0 });

      const res = await request(app.getHttpServer()).delete('/api/morador/7').set(sindico()).expect(200);

      expect(res.body.moradorStatus).toBe(0);
      expect(prisma.morador.update).toHaveBeenCalledWith({
        where: { moradorId: 7 },
        data: { moradorStatus: 0 },
      });
    });
  });

  describe('relação morador × imóvel', () => {
    it('lista com o estado derivado em cada item', async () => {
      prisma.moradorImovel.findMany.mockResolvedValue([
        {
          moradorImovelId: 1,
          moradorImovelDataInicio: new Date('2021-03-12'),
          moradorImovelDataFim: null,
        },
        {
          moradorImovelId: 2,
          moradorImovelDataInicio: new Date('2020-01-01'),
          moradorImovelDataFim: new Date('2021-01-01'),
        },
      ]);
      prisma.moradorImovel.count.mockResolvedValue(2);

      const res = await request(app.getHttpServer())
        .get('/api/morador-imovel?tipoRelacao=PROPRIETARIO')
        .set(bearer(tokenDe(SINDICO, 'SINDICO')))
        .expect(200);

      expect(res.body.data.map((v: any) => v.estado)).toEqual(['ATIVO', 'ENCERRADO']);
      expect(prisma.moradorImovel.findMany.mock.calls[0][0].where).toMatchObject({
        moradorImovelTipoRelacao: 'PROPRIETARIO',
      });
    });
  });

  describe('Swagger', () => {
    it('serve a UI e o JSON com as 29 operações', async () => {
      await request(app.getHttpServer()).get('/api/docs').expect(200);

      const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
      const ops = Object.values(res.body.paths).reduce(
        (soma: number, rota: any) => soma + Object.keys(rota).length,
        0,
      );
      expect(ops).toBe(29);
      expect(res.body.components.securitySchemes.JWT).toBeDefined();
    });
  });
});
