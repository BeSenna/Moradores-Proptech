import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MS Moradores rodando em http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`Swagger em http://localhost:${port}/api/docs`);
}
bootstrap();
