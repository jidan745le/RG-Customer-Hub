import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FileEntity } from './file/entities/file.entity';
import { FileModule } from './file/file.module';
import { LoginGuard } from './login.guard';
import { PermissionGuard } from './permission.guard';
import { SubApplication } from './tenant/entities/sub-application.entity';
import { TenantApplication } from './tenant/entities/tenant-application.entity';
import { Tenant } from './tenant/entities/tenant.entity';
import { TenantModule } from './tenant/tenant.module';
import { Permission } from './user/entities/permission.entity';
import { Role } from './user/entities/role.entity';
import { User } from './user/entities/user.entity';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: path.join(__dirname, '.env'),
      isGlobal: true,
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '7d',
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        console.log(configService.get<string>('DB_HOST'));
        console.log(configService.get<number>('DB_PORT'));
        console.log(configService.get<string>('DB_USERNAME'));
        console.log(configService.get<string>('DB_PASSWORD'));
        console.log(configService.get<string>('DB_DATABASE'));

        return {
          type: 'mysql',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          synchronize: true,
          entities: [
            User,
            Role,
            Permission,
            Tenant,
            SubApplication,
            TenantApplication,
            FileEntity,
          ],
          poolSize: 10,
          connectorPackage: 'mysql2',
          extra: {
            authPlugin: 'sha256_password',
          },
        };
      },
      inject: [ConfigService],
    }),
    UserModule,
    TenantModule,
    FileModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: LoginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
