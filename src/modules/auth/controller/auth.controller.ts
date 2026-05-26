import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthService } from '../auth.service';
import { CheckNicknameQueryDto } from '../dto/check-nickname-query.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { SignupDto } from '../dto/signup.dto';

@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('check-nickname')
  checkNickname(@Query() query: CheckNicknameQueryDto) {
    return this.authService.checkNickname(query.nickname);
  }

  @Post('signup')
  signup(@Body() body: SignupDto) {
    return this.authService.signup(body);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('refresh-token')
  refreshToken(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refreshToken);
  }
}
