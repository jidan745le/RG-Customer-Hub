import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
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

  @Get('app-config')
  async getAppConfig(
    @Req() request: Request,
    @Query('appcode') appcode?: string,
    @Query('mode') mode?: 'merge' | 'standalone',
  ) {
    try {
      const userId = request?.user?.id;
      const tenantId = request?.user?.tenantId;

      if (!userId || !tenantId) {
        throw new HttpException(
          'Invalid authentication',
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Default to merge mode if not specified
      const configMode = mode || 'merge';

      return this.tenantService.getTenantConfigByAppCode(
        appcode,
        tenantId,
        configMode,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve application configuration',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

  @Post('app-config')
  async updateAppConfig(
    @Body() settingsData: Record<string, any>,
    @Req() request: Request,
    @Query('appcode') appcode?: string,
  ) {
    if (!settingsData || typeof settingsData !== 'object') {
      throw new HttpException('Invalid settings data', HttpStatus.BAD_REQUEST);
    }

    try {
      const tenantId = request?.user?.tenantId;

      if (!tenantId) {
        throw new HttpException(
          'Invalid authentication',
          HttpStatus.UNAUTHORIZED,
        );
      }

      return this.tenantService.updateTenantAppSettings(
        appcode,
        tenantId,
        settingsData,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update application configuration',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Generic proxy endpoint for any request to avoid CORS issues
   *
   * Example usage:
   * ```javascript
   * // Using the generic proxy endpoint from frontend
   * const makeApiRequest = (url, method, data, params) => {
   *   return axios.post('/api-proxy', {
   *     targetUrl: url,
   *     method: method || 'GET',
   *     data: data || {},
   *     params: params || {}
   *   });
   * };
   * ```
   */
  @Post('api-proxy')
  async proxyRequest(
    @Body()
    requestData: {
      targetUrl: string;
      method?: string;
      data?: any;
      params?: any;
      headers?: any;
    },
  ) {
    try {
      const {
        targetUrl,
        method = 'GET',
        data = {},
        params = {},
        headers = {},
      } = requestData;

      // Validate required fields
      if (!targetUrl) {
        throw new HttpException('Missing target URL', HttpStatus.BAD_REQUEST);
      }

      // Set default headers
      const requestHeaders = {
        'Content-Type': 'application/json',
        ...headers,
      };

      // Make the API call
      const response = await axios({
        method,
        url: targetUrl,
        data,
        params,
        headers: requestHeaders,
      });

      // Return the response data directly
      return response.data;
    } catch (error) {
      // Handle axios errors
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        throw new HttpException(
          error.response.data || 'Proxy request failed',
          error.response.status || HttpStatus.BAD_REQUEST,
        );
      } else if (error.request) {
        // The request was made but no response was received
        throw new HttpException(
          'No response received from target server',
          HttpStatus.BAD_GATEWAY,
        );
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new HttpException(
          error.message || 'Failed to proxy request',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }
}
