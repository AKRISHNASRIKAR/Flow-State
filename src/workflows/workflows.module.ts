import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { WorkflowOwnerGuard } from './guards/workflow-owner.guard';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [SharedModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowOwnerGuard],
})
export class WorkflowsModule {}
