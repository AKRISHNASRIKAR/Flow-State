import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { GoogleExchangeDto } from './dto/google-exchange.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthService } from './google/google-auth.service';
import { AuthenticatedRequest } from './types/authenticated-request';

const TOKEN_PAIR_EXAMPLE = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  tokenType: 'Bearer',
  expiresIn: 900,
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  // Public because the browser navigates here directly (no Authorization
  // header on a top-level navigation) — the nonce, not a session, is what
  // ties the flow to its initiator.
  @Public()
  @Get('google/start')
  @ApiOperation({
    summary: 'Begin Google sign-in',
    description:
      'Browser navigation, not an XHR. Redirects to Google with PKCE. Responds 503 if Google sign-in is not configured.',
  })
  @ApiQuery({
    name: 'nonce',
    description:
      'Random value the dashboard keeps in sessionStorage (min 16 chars)',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description: 'Dashboard path to land on after sign-in',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  @ApiResponse({ status: 503, description: 'Google sign-in not configured' })
  async googleStart(
    @Query('returnTo') returnTo: unknown,
    @Query('nonce') nonce: unknown,
    @Res() res: Response,
  ) {
    res.redirect(
      HttpStatus.FOUND,
      await this.googleAuth.buildAuthorizationUrl(returnTo, nonce),
    );
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth redirect target',
    description:
      'Called by Google, not by clients. Always redirects to the dashboard: /auth/callback?code=… on success, /login?error=… on failure.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the dashboard' })
  async googleCallback(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    res.redirect(HttpStatus.FOUND, await this.googleAuth.handleCallback(query));
  }

  @Public()
  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a sign-in handoff code for a session',
    description:
      'Single-use: the code is deleted on first exchange, and the nonce must match the one passed to /auth/google/start.',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed in',
    schema: { example: TOKEN_PAIR_EXAMPLE },
  })
  @ApiResponse({
    status: 401,
    description: 'Code invalid, expired, already used, or nonce mismatch',
  })
  googleExchange(@Body() dto: GoogleExchangeDto) {
    return this.googleAuth.exchangeHandoff(dto.code, dto.nonce);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Issues a new access token and refresh token by validating the provided refresh token. The old refresh token is rotated (invalidated).',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the provided refresh token. Requires a valid Bearer access token in the Authorization header.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    schema: { example: { success: true } },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid access token',
  })
  logout(@Req() request: AuthenticatedRequest, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(request.user.sub, dto.refreshToken);
  }
}
