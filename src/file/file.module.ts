import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { FileEntity } from './entities/file.entity';
import { FileController } from './file.controller';
import { FileService } from './file.service';

@Module({
  imports: [
    // Use memory storage for multer
    MulterModule.register({
      storage: memoryStorage(),
    }),
    TypeOrmModule.forFeature([FileEntity]),
  ],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
