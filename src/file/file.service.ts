import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { FileEntity } from './entities/file.entity';

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

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly uploadDir = join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(FileEntity)
    private fileRepository: Repository<FileEntity>,
  ) {
    // Ensure upload directory exists
    this.ensureUploadDirExists();
  }

  private async ensureUploadDirExists() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      this.logger.log(`Upload directory created: ${this.uploadDir}`);
    } catch (error) {
      this.logger.error(`Failed to create upload directory: ${error.message}`);
    }
  }

  async saveFile(file: MulterFile): Promise<FileEntity> {
    try {
      // Generate unique filename
      const fileExtension = file.originalname.split('.').pop() || '';
      const uniqueFilename = `${uuidv4()}.${fileExtension}`;
      const filePath = join(this.uploadDir, uniqueFilename);

      // Save file to disk
      await fs.writeFile(filePath, file.buffer);

      // Create database record
      const fileEntity = new FileEntity();
      fileEntity.originalname = file.originalname;
      fileEntity.filename = uniqueFilename;
      fileEntity.mimetype = file.mimetype;
      fileEntity.size = file.size;
      fileEntity.path = join('uploads', uniqueFilename);

      // Save to database
      return this.fileRepository.save(fileEntity);
    } catch (error) {
      this.logger.error(`Failed to save file: ${error.message}`);
      throw error;
    }
  }

  async getFileDetails(filename: string): Promise<FileEntity> {
    try {
      const fileEntity = await this.fileRepository.findOne({
        where: { filename },
      });

      if (!fileEntity) {
        throw new NotFoundException(`File with name ${filename} not found`);
      }

      // Check if file exists on disk
      const filePath = join(process.cwd(), fileEntity.path);
      await fs.access(filePath);

      return fileEntity;
    } catch (error) {
      this.logger.error(`Failed to get file details: ${error.message}`);
      throw error;
    }
  }
}
