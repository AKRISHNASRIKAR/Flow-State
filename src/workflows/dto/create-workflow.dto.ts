import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWorkflowDto {
  @ApiProperty({
    description: 'Name of the workflow',
    example: 'Daily Sync Pipeline',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional description of what this workflow does',
    example: 'Syncs data from Source A to Destination B every night at midnight',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether the workflow should be active/enabled',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
