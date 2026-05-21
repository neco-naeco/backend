import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuntimeIntegrationModule } from '@integrations/runtime/runtime.module';
import { ExecutionEntity } from './entity/execution.entity';
import { ExecutionsService } from './service/executions.service';

/**
 * Responsibilities: persist execution requests, track execution state,
 * store stdout/stderr/exit code.
 * To be implemented by Worker 3.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ExecutionEntity]), RuntimeIntegrationModule],
  providers: [ExecutionsService],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
