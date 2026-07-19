import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UploadsService, PresignedUploadRequest } from './uploads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('File Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly svc: UploadsService) {}

  @Post('presigned-url')
  @ApiOperation({ summary: 'Get a short-lived presigned URL to upload a file directly to storage' })
  getPresignedUrl(@Body() body: PresignedUploadRequest, @CurrentUser() user: User) {
    return this.svc.getPresignedUploadUrl(body, user.id);
  }
}
