import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
  });

  app.use(
    '/webhooks',
    (req: RawBodyRequest, _res: Response, next: NextFunction) => {
      let data = Buffer.alloc(0);

      req.on('data', (chunk: Buffer) => {
        data = Buffer.concat([data, chunk]);
      });

      req.on('end', () => {
        req.rawBody = data;
        next();
      });

      req.on('error', (err) => next(err));
    },
  );

  const jsonParser = json();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/webhooks')) {
      next();
      return;
    }

    jsonParser(req, res, next);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlowForge API')
    .setDescription(
      'REST API for FlowForge — a workflow automation platform. ' +
        'Use the **Authorize** button to set your Bearer token for protected endpoints.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📄 Swagger UI at http://localhost:${port}/api/docs`);
}

void bootstrap();
