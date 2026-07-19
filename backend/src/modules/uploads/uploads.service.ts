import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates short-lived presigned URLs so the browser uploads file bytes
 * directly to S3 - the API server never touches the file body. This is the
 * standard pattern referenced throughout the codebase wherever a fileKey
 * is recorded (KYC documents, claim documents, policy schedules).
 *
 * Without AWS credentials configured, returns a clear configuration error
 * rather than crashing - consistent with how every other optional external
 * integration in this codebase degrades (payments, weather, SMS, etc).
 */

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'doc', 'docx'];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const PRESIGNED_URL_EXPIRY_SECONDS = 300;

export interface PresignedUploadRequest {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  folder: 'kyc-documents' | 'claim-documents' | 'profile-photos';
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private s3Client: S3Client | null = null;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>('aws.secretAccessKey');
    const region = this.configService.get<string>('aws.region');

    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    } else {
      this.logger.warn('AWS credentials not configured - file uploads will return a configuration error until AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set.');
    }
  }

  async getPresignedUploadUrl(
    request: PresignedUploadRequest,
    uploaderUserId: string,
  ): Promise<PresignedUploadResponse> {
    const extension = request.fileName.split('.').pop()?.toLowerCase() || '';

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException(
        `File type .${extension} is not allowed. Accepted types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }
    if (request.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds the 15MB size limit`);
    }

    if (!this.s3Client) {
      throw new BadRequestException(
        'File storage is not configured on this server. Contact your administrator to set up AWS S3 credentials.',
      );
    }

    const bucket = this.configService.get<string>('aws.s3Bucket');
    const fileKey = `${request.folder}/${uploaderUserId}/${uuidv4()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: request.fileType,
      ServerSideEncryption: 'AES256',
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });

    return { uploadUrl, fileKey, expiresIn: PRESIGNED_URL_EXPIRY_SECONDS };
  }
}
