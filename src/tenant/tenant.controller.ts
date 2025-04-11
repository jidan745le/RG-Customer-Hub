import { Controller, Get, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RequireLogin, RequirePermission } from '../custom-decorator';
import { TenantService } from './tenant.service';

@Controller('api')
@RequireLogin()
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('tenants')
  @RequirePermission('system:user:read')
  async getTenants() {
    return this.tenantService.findAllTenants();
  }

  @Get('sub-applications')
  async getSubApplications(@Req() request: Request) {
    const userId = request?.user?.id;

    return this.tenantService.findAccessibleSubApplications(userId);
  }
}
