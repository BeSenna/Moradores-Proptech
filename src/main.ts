import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { caminhoApi } from './app.constants';
import { configureApp } from './app.setup';
import { swaggerHabilitado } from './swagger/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  // permite encerrar com SIGTERM (docker stop): fecha o banco e o RabbitMQ antes de sair
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 7522;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MS Moradores rodando em http://localhost:${port}${caminhoApi()}`);
  // eslint-disable-next-line no-console
  console.log(`Health check em http://localhost:${port}${caminhoApi('health')}`);
  // eslint-disable-next-line no-console
  console.log(
    swaggerHabilitado()
      ? `Swagger em http://localhost:${port}${caminhoApi('docs')}`
      : 'Swagger desativado (produção). Para ligar, defina SWAGGER_ENABLED=true.',
  );
}
bootstrap();