import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActionExecutorService } from './action-executor.service';

@Module({
  imports: [ConfigModule],
  providers: [ActionExecutorService],
  exports: [ActionExecutorService],
})
export class ActionExecutorModule {}
