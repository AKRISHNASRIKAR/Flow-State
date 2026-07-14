import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TriggerType } from '@prisma/client';

export class CreateTriggerDto {
  @ApiProperty({
    enum: TriggerType,
    description: 'The trigger type: WEBHOOK, MANUAL, or SCHEDULED',
    example: 'WEBHOOK',
  })
  @IsEnum(TriggerType, {
    message: `type must be one of: ${Object.values(TriggerType).join(', ')}`,
  })
  type!: TriggerType;

  @ApiPropertyOptional({
    description:
      'Trigger-specific configuration. For SCHEDULED triggers this would hold a cron expression, etc.',
    example: { url: 'https://example.com/callback' },
  })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
