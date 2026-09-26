import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class GoogleExchangeDto {
  @ApiProperty({
    description:
      'One-time handoff code from the /auth/callback redirect. Valid for 60 seconds.',
    example: 'q3J0cFz0mX2L8vF9...',
  })
  @IsString()
  @Length(16, 128)
  code!: string;

  @ApiProperty({
    description:
      'The nonce the dashboard passed to /auth/google/start, read back from sessionStorage. Binds the sign-in to the tab that started it.',
    example: '6c1f0d0e-3b7a-4f3e-9a51-0b0f5f3c2d11',
  })
  @IsString()
  @Length(16, 128)
  nonce!: string;
}
