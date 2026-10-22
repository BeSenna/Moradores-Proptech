import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { obterJwtSecret } from './jwt-secret';

@Module({
  imports: [
    PassportModule,
    // registerAsync: o segredo é lido na hora de montar o módulo (depois de o .env/Infisical estar carregado)
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: obterJwtSecret(),
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AdminBootstrapService],
  exports: [AuthService],
})
export class AuthModule {}
