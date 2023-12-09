import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { TimeoutInterceptor } from './timeout.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableVersioning({
    prefix: 'v',
    defaultVersion: '1',
    type: VersioningType.URI,
  });
  app.useGlobalInterceptors(new TimeoutInterceptor());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  app.enableShutdownHooks();

  await app.listen(parseInt(process.env.PORT as string, 10) || 3000);
}
bootstrap();
