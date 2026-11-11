import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PREFIXO_API } from './app.constants';
import { setupSwagger } from './swagger/swagger.config';
import { accessLog } from './common/logging/access-log.middleware';

// Configuração compartilhada entre a aplicação real (main.ts) e os testes e2e,
// para que os testes exercitem exatamente o mesmo pipeline (validação, prefixo, Swagger).
export function configureApp(app: INestApplication) {
  app.enableCors();

  // log de acesso (quem, o quê, quando, de onde); nos testes automatizados fica desligado para não poluir a saída
  if (process.env.NODE_ENV !== 'test') app.use(accessLog);

  // remove campos não declarados no DTO e converte tipos automaticamente (ex.: string -> number em query params)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix(PREFIXO_API);

  // Documentação interativa (Swagger) em /docs (sob o prefixo, se houver) — só quando habilitada (ver swaggerHabilitado)
  setupSwagger(app);
}