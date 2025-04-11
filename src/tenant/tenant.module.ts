import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../user/entities/permission.entity';
import { Role } from '../user/entities/role.entity';
import { User } from '../user/entities/user.entity';
import { SubApplication } from './entities/sub-application.entity';
import { TenantApplication } from './entities/tenant-application.entity';
import { Tenant } from './entities/tenant.entity';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      SubApplication,
      TenantApplication,
      User,
      Role,
      Permission,
    ]),
  ],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {} 