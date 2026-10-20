import { INestApplication, ValidationPipe } from '@nestjs/common';
import { setupSwagger } from './swagger/swagger.config';

// Configuração compartilhada entre a aplicação real (main.ts) e os testes e2e,
// para que os testes exercitem exatamente o mesmo pipeline (validação, prefixo, Swagger).
export function configureApp(app: INestApplication) {
  app.enableCors();

  // remove campos não declarados no DTO e converte tipos automaticamente (ex.: string -> number em query params)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  // Documentação interativa (Swagger) em /api/docs
  setupSwagger(app);
}
