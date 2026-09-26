import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedModule } from '../shared/shared.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google/google-auth.service';

@Module({
  imports: [JwtModule.register({}), SharedModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleAuthService],
  exports: [JwtModule],
})
export class AuthModule {}
