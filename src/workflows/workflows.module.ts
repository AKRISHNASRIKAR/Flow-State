import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ActionsController } from './actions/actions.controller';
import { ActionsService } from './actions/actions.service';
import { WorkflowOwnerGuard } from './guards/workflow-owner.guard';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [SharedModule],
  controllers: [WorkflowsController, ActionsController],
  providers: [WorkflowsService, WorkflowOwnerGuard, ActionsService],
  exports: [WorkflowsService, WorkflowOwnerGuard],
})
export class WorkflowsModule {}
