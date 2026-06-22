import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateActionDto {
  @ApiPropertyOptional({
    description: 'Updated action type',
    example: 'HTTP_REQUEST',
    minLength: 1,
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  type?: string;

  @ApiPropertyOptional({
    description: 'Updated action configuration',
    example: { url: 'https://api.example.com', method: 'POST' },
  })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Updated execution order',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
