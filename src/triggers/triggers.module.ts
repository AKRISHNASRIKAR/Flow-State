import { Module } from '@nestjs/common';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SharedModule } from '../shared/shared.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';

@Module({
  imports: [SchedulerModule, SharedModule, WorkflowsModule],
  controllers: [TriggersController],
  providers: [TriggersService],
})
export class TriggersModule {}
