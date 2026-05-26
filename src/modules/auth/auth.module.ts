import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtIntegrationModule } from '../../integrations/jwt/jwt.module';
import { AiChatSession } from '../ai-chat-sessions/entity/ai-chat-session.entity';
import { AuthController } from './controller/auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entity/refresh-token.entity';
import { User } from './entity/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, AiChatSession]),
    JwtIntegrationModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, TypeOrmModule],
})
export class AuthModule {}
