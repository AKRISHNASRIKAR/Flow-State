import { Module } from '@nestjs/common';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';

@Module({
  imports: [WorkflowsModule],
  controllers: [TriggersController],
  providers: [TriggersService],
})
export class TriggersModule {}
