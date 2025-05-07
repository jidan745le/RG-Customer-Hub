import {
    Controller,
    Get,
    HttpException,
    HttpStatus,
    MaxFileSizeValidator,
    Param,
    ParseFilePipeBuilder,
    Post,
    Res,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { join } from 'path';
import { RequireLogin } from '../custom-decorator';
import { FileService } from './file.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Controller('files')
@RequireLogin()
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addValidator(new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })) // 5MB max size
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: MulterFile,
  ) {
    try {
      const savedFile = await this.fileService.saveFile(file);
      return {
        url: `/files/${savedFile.filename}`,
        filename: savedFile.originalname,
        size: savedFile.size,
        mimetype: savedFile.mimetype,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to upload file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':filename')
  async getFile(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const fileDetails = await this.fileService.getFileDetails(filename);

      if (!fileDetails) {
        throw new HttpException('File not found', HttpStatus.NOT_FOUND);
      }

      const file = createReadStream(join(process.cwd(), fileDetails.path));

      res.set({
        'Content-Type': fileDetails.mimetype,
        'Content-Disposition': `inline; filename="${fileDetails.originalname}"`,
      });

      return new StreamableFile(file);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to retrieve file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
