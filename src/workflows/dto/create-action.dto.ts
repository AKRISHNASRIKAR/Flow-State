import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateActionDto {
  @ApiProperty({
    description: 'The action type (e.g. SEND_EMAIL, HTTP_REQUEST, DELAY)',
    example: 'SEND_EMAIL',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  type!: string;

  @ApiPropertyOptional({
    description: 'Action-specific configuration object',
    example: { to: 'user@example.com', subject: 'Welcome!' },
  })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Execution order (0-based). Lower runs first.',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
