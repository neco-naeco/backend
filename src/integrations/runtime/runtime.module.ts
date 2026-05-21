import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RUNTIME_ADAPTER, RUNTIME_COMMAND_RUNNER } from './runtime.constants';
import { DockerCliCommandRunner, DockerRuntimeAdapter } from './runtime-defaults.service';

/**
 * Docker/container runtime integration adapter.
 * Covers: container lifecycle, docker exec, stdout/stderr/exit-code collection.
 * Worker 3 (realtime/runtime) will implement the provider.
 * Ref: docs/specs/07-integrations-and-ai.md (Confirmed Docker Model)
 */
@Module({
  imports: [ConfigModule],
  providers: [
    DockerCliCommandRunner,
    DockerRuntimeAdapter,
    {
      provide: RUNTIME_COMMAND_RUNNER,
      useExisting: DockerCliCommandRunner,
    },
    {
      provide: RUNTIME_ADAPTER,
      useExisting: DockerRuntimeAdapter,
    },
  ],
  exports: [RUNTIME_ADAPTER, RUNTIME_COMMAND_RUNNER, DockerRuntimeAdapter],
})
export class RuntimeIntegrationModule {}
