import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Registered email address',
    example: 'user@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Account password (minimum 8 characters)',
    example: 'securePass123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
