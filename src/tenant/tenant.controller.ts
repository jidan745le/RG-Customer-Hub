import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RequireLogin, RequirePermission } from '../custom-decorator';
import { UserService } from '../user/user.service';
import { TenantService } from './tenant.service';

@Controller()
@RequireLogin()
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
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

  @Get('verify-auth')
  async verifyAuth(@Req() request: Request) {
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new HttpException('Not logged in', HttpStatus.UNAUTHORIZED);
    }

    try {
      const token = authorization.split(' ')[1];
      const data = this.jwtService.verify(token);

      if (!data.user || !data.user.id) {
        throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
      }

      // Get full user data with roles and permissions
      const roles = await this.userService.findRolesByIds(
        data.user.roles.map((role) => role.id),
      );

      // Extract permissions from roles
      const permissions = roles.reduce((allPermissions, role) => {
        if (role.permissions) {
          allPermissions.push(...role.permissions);
        }
        return allPermissions;
      }, []);

      // Get tenant information
      const tenants = await this.tenantService.findAllTenants();
      const userTenant = tenants.find(
        (tenant) => tenant.id === data.user.tenantId,
      );

      return {
        status: 'success',
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          roles: roles,
          permissions: permissions,
          tenant: userTenant,
          subApplications: data.user.subApplications, // Add sub-applications to the token
        },
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new HttpException('Token expired', HttpStatus.UNAUTHORIZED);
      } else if (error.name === 'JsonWebTokenError') {
        throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
      } else {
        throw new HttpException(
          error.message || 'Authentication failed',
          error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }
}
