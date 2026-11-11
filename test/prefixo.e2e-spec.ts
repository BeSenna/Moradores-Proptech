// API_PREFIX precisa existir antes de qualquer import do app (app.constants lê a variável ao ser carregado).
process.env.API_PREFIX = '/condominio/morador/';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPrismaMock } from './helpers/prisma-mock';

// Cobre o uso opcional de API_PREFIX (proxy que repassa o caminho completo).
// O comportamento padrão (sem prefixo, como no servidor da faculdade) é coberto em app.e2e-spec.ts.
describe('API_PREFIX configurado', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createPrismaMock())
      .overrideProvider(EventsService)
      .useValue({ publish: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('atende sob o prefixo (barras nas pontas são ignoradas)', async () => {
    await request(app.getHttpServer()).get('/condominio/morador/health').expect(200);
  });

  it('não atende na raiz quando há prefixo', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
