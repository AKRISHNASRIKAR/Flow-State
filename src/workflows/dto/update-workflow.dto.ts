import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateWorkflowDto {
  @ApiPropertyOptional({
    description: 'New name for the workflow',
    example: 'Nightly Batch Job',
    minLength: 1,
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated description for the workflow',
    example: 'Processes batch records from the data warehouse',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Enable or disable the workflow',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
