import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ActionExecutorModule } from './actions/action-executor.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { EventsModule } from './events/events.module';
import { ExecutionsModule } from './executions/executions.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TriggersModule } from './triggers/triggers.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
    AuthModule,
    ActionExecutorModule,
    EventsModule,
    SchedulerModule,
    WorkflowsModule,
    TriggersModule,
    WebhooksModule,
    ExecutionsModule,
    HealthModule,
    AdminModule,
    TelegramModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
