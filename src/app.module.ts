import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { JwtIntegrationModule } from './integrations/jwt/jwt.module';
import { AuthModule } from './modules/auth/auth.module';
import appConfig from './common/config/app.config';
import databaseConfig from './common/config/database.config';
import jwtConfig from './common/config/jwt.config';
import redisConfig from './common/config/redis.config';
import llmConfig from './common/config/llm.config';
import runtimeConfig from './common/config/runtime.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, llmConfig, runtimeConfig],
    }),
    DatabaseModule,
    JwtIntegrationModule,
    AuthModule,
  ],
})
export class AppModule {}
