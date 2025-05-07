import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Permission } from '../user/entities/permission.entity';
import { Role } from '../user/entities/role.entity';
import { User } from '../user/entities/user.entity';
import { SubApplication } from './entities/sub-application.entity';
import { TenantApplication } from './entities/tenant-application.entity';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(SubApplication)
    private subApplicationRepository: Repository<SubApplication>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(TenantApplication)
    private tenantApplicationRepository: Repository<TenantApplication>,
  ) {
    // Initialize data when the service is first created
    this.initializeData();
  }

  async findAllTenants() {
    return this.tenantRepository.find({
      where: { status: 'active' },
    });
  }

  async findAccessibleSubApplications(userId: string) {
    this.logger.debug(`Finding accessible apps for userId: ${userId}`);

    // Find the user with their roles and permissions
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'roles',
        'roles.permissions',
        'tenant',
        'tenant.tenantApplications',
        'tenant.tenantApplications.application',
      ],
    });

    this.logger.debug(`User found: ${user ? user.id : 'null'}`);

    if (!user || !user.tenant) {
      this.logger.warn(
        `User not found or user has no tenant. User: ${!!user}, Tenant: ${!!user?.tenant}`,
      );
      return [];
    }

    this.logger.debug(`Tenant found: ${user.tenant.id}`);
    this.logger.debug(
      `Tenant Applications raw: ${JSON.stringify(
        user.tenant.tenantApplications,
        null,
        2,
      )}`,
    );

    // Get all app access permissions that the user has
    const userPermissions = user.roles.flatMap((role) => role.permissions);
    this.logger.debug(
      `User raw permissions: ${JSON.stringify(userPermissions)}`,
    );

    const appAccessPermissions = userPermissions
      .filter(
        (permission) =>
          permission.code.startsWith('app:') &&
          permission.code.endsWith(':access'),
      )
      .map((permission) => permission.code.split(':')[1]); // Extract app code

    this.logger.debug(
      `Extracted app access permission codes: ${JSON.stringify(
        appAccessPermissions,
      )}`,
    );

    // Filter tenant's applications that the user has access to
    const applicationsAfterStatusFilter = user.tenant.tenantApplications.filter(
      (tenantApp) =>
        tenantApp.application && tenantApp.application.status === 'active',
    );

    this.logger.debug(
      `Applications after status filter: ${JSON.stringify(
        applicationsAfterStatusFilter.map((ta) => ta.application?.code),
      )}`,
    );

    const mappedApplications = applicationsAfterStatusFilter.map(
      (tenantApp) => tenantApp.application,
    );

    this.logger.debug(
      `Mapped applications before permission filter: ${JSON.stringify(
        mappedApplications.map((app) => app?.code),
      )}`,
    );

    const accessibleApps = mappedApplications.filter(
      (app) => app && appAccessPermissions.includes(app.code),
    );

    this.logger.debug(
      `Final accessible apps: ${JSON.stringify(
        accessibleApps.map((app) => app?.code),
      )}`,
    );

    return accessibleApps;
  }

  async getTenantConfigByAppCode(appcode: string, tenantId: string) {
    this.logger.debug(
      `Getting tenant config for appcode: ${appcode}, tenantId: ${tenantId}`,
    );

    // Find the tenant
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId, status: 'active' },
      relations: ['tenantApplications', 'tenantApplications.application'],
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with ID ${tenantId} not found or inactive`,
      );
    }

    // Find the application by code
    const tenantApplication = tenant.tenantApplications.find(
      (ta) =>
        ta.application &&
        ta.application.code === appcode &&
        ta.application.status === 'active',
    );

    if (!tenantApplication) {
      throw new NotFoundException(
        `Application with code ${appcode} not found for this tenant or inactive`,
      );
    }

    // Extract custom settings from tenant and any app-specific configurations
    const config = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subscription_plan: tenant.subscription_plan,
      },
      application: {
        id: tenantApplication.application.id,
        code: tenantApplication.application.code,
        name: tenantApplication.application.name,
        path: tenantApplication.application.path,
        url: tenantApplication.application.url,
      },
      settings: {
        ...tenant.custom_settings,
        ...(tenantApplication.settings || {}),
      },
    };

    return config;
  }

  async updateTenantAppSettings(
    appcode: string,
    tenantId: string,
    settingsData: Record<string, any>,
  ) {
    this.logger.debug(
      `Updating tenant app settings for appcode: ${appcode}, tenantId: ${tenantId}`,
    );

    // Find the tenant application record
    const tenantApp = await this.tenantApplicationRepository.findOne({
      where: {
        tenant_id: tenantId,
        application: {
          code: appcode,
          status: 'active',
        },
      },
      relations: ['tenant', 'application'],
    });

    if (!tenantApp) {
      throw new NotFoundException(
        `Application with code ${appcode} not found for tenant ${tenantId} or inactive`,
      );
    }

    // Update settings
    tenantApp.settings = {
      ...(tenantApp.settings || {}),
      ...settingsData,
    };

    // Save the updated settings
    await this.tenantApplicationRepository.save(tenantApp);

    // Return updated configuration
    return this.getTenantConfigByAppCode(appcode, tenantId);
  }

  async initializeData() {
    // Clear all existing data
    await this.tenantApplicationRepository.clear();
    await this.userRepository.clear();
    await this.roleRepository.clear();
    await this.permissionRepository.clear();
    await this.subApplicationRepository.clear();
    await this.tenantRepository.clear();

    // Create permissions
    const permissions = await this.createPermissions();

    // Create tenants
    const simalfa = await this.tenantRepository.save({
      id: uuidv4(),
      name: 'SIMALFA',
      status: 'active',
      subscription_plan: 'enterprise',
      custom_settings: {},
    });

    const kendo = await this.tenantRepository.save({
      id: uuidv4(),
      name: 'Kendo',
      status: 'active',
      subscription_plan: 'enterprise',
      custom_settings: {},
    });

    const rgexp = await this.tenantRepository.save({
      id: uuidv4(),
      name: 'rgexp',
      status: 'active',
      subscription_plan: 'enterprise',
      custom_settings: {},
    });

    // Create Tenant Administrator roles for each tenant
    const simalfaAdminRole = await this.roleRepository.save({
      id: uuidv4(),
      name: 'Tenant Administrator',
      description: 'Has full access to manage the tenant',
      tenantId: simalfa.id,
      isSystemRole: true,
      permissions: permissions,
    });

    const kendoAdminRole = await this.roleRepository.save({
      id: uuidv4(),
      name: 'Tenant Administrator',
      description: 'Has full access to manage the tenant',
      tenantId: kendo.id,
      isSystemRole: true,
      permissions: permissions,
    });

    const rgexpAdminRole = await this.roleRepository.save({
      id: uuidv4(),
      name: 'Tenant Administrator',
      description: 'Has full access to manage the tenant',
      tenantId: rgexp.id,
      isSystemRole: true,
      permissions: permissions,
    });

    // Create admin users for each tenant
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await this.userRepository.save({
      id: uuidv4(),
      email: 'admin@simalfa.com',
      name: 'SIMALFA Admin',
      password: hashedPassword,
      tenantId: simalfa.id,
      roles: [simalfaAdminRole],
    });

    await this.userRepository.save({
      id: uuidv4(),
      email: 'admin@kendo.com',
      name: 'Kendo Admin',
      password: hashedPassword,
      tenantId: kendo.id,
      roles: [kendoAdminRole],
    });

    await this.userRepository.save({
      id: uuidv4(),
      email: 'admin@rgexp.com',
      name: 'rgexp Admin',
      password: hashedPassword,
      tenantId: rgexp.id,
      roles: [rgexpAdminRole],
    });

    // Create sub-applications
    const einvoiceApp = await this.subApplicationRepository.save({
      id: uuidv4(),
      code: 'einvoice',
      name: 'Electronic Invoice System',
      description: 'Manage electronic invoices',
      path: '/einvoice',
      status: 'active',
    });

    const imagemapApp = await this.subApplicationRepository.save({
      id: uuidv4(),
      code: 'imagemap',
      name: 'Image Mapping System',
      description: 'Manage image mappings',
      path: '/imagemap',
      status: 'active',
    });

    const marketinghubApp = await this.subApplicationRepository.save({
      id: uuidv4(),
      code: 'marketinghub',
      name: 'Marketing Hub',
      description: 'Manage marketing campaigns',
      path: '/marketinghub',
      status: 'active',
    });

    // Assign applications to tenants according to requirements
    // SIMALFA has einvoice, imagemap
    await this.tenantApplicationRepository.save([
      {
        tenant_id: simalfa.id,
        application_id: einvoiceApp.id,
        status: 'active',
      },
      {
        tenant_id: simalfa.id,
        application_id: imagemapApp.id,
        status: 'active',
      },
    ]);

    // Kendo has imagemap, marketinghub
    await this.tenantApplicationRepository.save([
      { tenant_id: kendo.id, application_id: imagemapApp.id, status: 'active' },
      {
        tenant_id: kendo.id,
        application_id: marketinghubApp.id,
        status: 'active',
      },
    ]);

    // rgexp has all applications
    await this.tenantApplicationRepository.save([
      { tenant_id: rgexp.id, application_id: einvoiceApp.id, status: 'active' },
      { tenant_id: rgexp.id, application_id: imagemapApp.id, status: 'active' },
      {
        tenant_id: rgexp.id,
        application_id: marketinghubApp.id,
        status: 'active',
      },
    ]);
  }

  private async createPermissions() {
    const permissionData = [
      // System permissions
      {
        code: 'system:user:create',
        name: 'Create User',
        type: 'system',
        resource: 'user',
        action: 'create',
      },
      {
        code: 'system:user:read',
        name: 'Read User',
        type: 'system',
        resource: 'user',
        action: 'read',
      },
      {
        code: 'system:user:update',
        name: 'Update User',
        type: 'system',
        resource: 'user',
        action: 'update',
      },
      {
        code: 'system:user:delete',
        name: 'Delete User',
        type: 'system',
        resource: 'user',
        action: 'delete',
      },
      {
        code: 'system:user:list',
        name: 'List Users',
        type: 'system',
        resource: 'user',
        action: 'list',
      },

      {
        code: 'system:role:create',
        name: 'Create Role',
        type: 'system',
        resource: 'role',
        action: 'create',
      },
      {
        code: 'system:role:read',
        name: 'Read Role',
        type: 'system',
        resource: 'role',
        action: 'read',
      },
      {
        code: 'system:role:update',
        name: 'Update Role',
        type: 'system',
        resource: 'role',
        action: 'update',
      },
      {
        code: 'system:role:delete',
        name: 'Delete Role',
        type: 'system',
        resource: 'role',
        action: 'delete',
      },
      {
        code: 'system:role:list',
        name: 'List Roles',
        type: 'system',
        resource: 'role',
        action: 'list',
      },

      // Application access permissions
      {
        code: 'app:einvoice:access',
        name: 'Access E-Invoice',
        type: 'application',
        resource: 'einvoice',
        action: 'access',
      },
      {
        code: 'app:imagemap:access',
        name: 'Access Image Map',
        type: 'application',
        resource: 'imagemap',
        action: 'access',
      },
      {
        code: 'app:marketinghub:access',
        name: 'Access Marketing Hub',
        type: 'application',
        resource: 'marketinghub',
        action: 'access',
      },

      // E-Invoice permissions
      {
        code: 'einvoice:invoice:create',
        name: 'Create Invoice',
        type: 'feature',
        resource: 'invoice',
        action: 'create',
      },
      {
        code: 'einvoice:invoice:read',
        name: 'Read Invoice',
        type: 'feature',
        resource: 'invoice',
        action: 'read',
      },
      {
        code: 'einvoice:invoice:update',
        name: 'Update Invoice',
        type: 'feature',
        resource: 'invoice',
        action: 'update',
      },
      {
        code: 'einvoice:invoice:delete',
        name: 'Delete Invoice',
        type: 'feature',
        resource: 'invoice',
        action: 'delete',
      },
      {
        code: 'einvoice:invoice:list',
        name: 'List Invoices',
        type: 'feature',
        resource: 'invoice',
        action: 'list',
      },
      {
        code: 'einvoice:invoice:issue',
        name: 'Issue Invoice',
        type: 'feature',
        resource: 'invoice',
        action: 'issue',
      },
      {
        code: 'einvoice:invoice:cancel',
        name: 'Cancel Invoice',
        type: 'feature',
        resource: 'invoice',
        action: 'cancel',
      },
      {
        code: 'einvoice:invoice:export',
        name: 'Export Invoices',
        type: 'feature',
        resource: 'invoice',
        action: 'export',
      },

      // Image Map permissions
      {
        code: 'imagemap:image:create',
        name: 'Create Image',
        type: 'feature',
        resource: 'image',
        action: 'create',
      },
      {
        code: 'imagemap:image:read',
        name: 'Read Image',
        type: 'feature',
        resource: 'image',
        action: 'read',
      },
      {
        code: 'imagemap:image:update',
        name: 'Update Image',
        type: 'feature',
        resource: 'image',
        action: 'update',
      },
      {
        code: 'imagemap:image:delete',
        name: 'Delete Image',
        type: 'feature',
        resource: 'image',
        action: 'delete',
      },
      {
        code: 'imagemap:image:list',
        name: 'List Images',
        type: 'feature',
        resource: 'image',
        action: 'list',
      },
      {
        code: 'imagemap:map:create',
        name: 'Create Map',
        type: 'feature',
        resource: 'map',
        action: 'create',
      },
      {
        code: 'imagemap:map:read',
        name: 'Read Map',
        type: 'feature',
        resource: 'map',
        action: 'read',
      },
      {
        code: 'imagemap:map:update',
        name: 'Update Map',
        type: 'feature',
        resource: 'map',
        action: 'update',
      },
      {
        code: 'imagemap:map:delete',
        name: 'Delete Map',
        type: 'feature',
        resource: 'map',
        action: 'delete',
      },
      {
        code: 'imagemap:map:list',
        name: 'List Maps',
        type: 'feature',
        resource: 'map',
        action: 'list',
      },

      // Marketing Hub permissions
      {
        code: 'marketinghub:campaign:create',
        name: 'Create Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'create',
      },
      {
        code: 'marketinghub:campaign:read',
        name: 'Read Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'read',
      },
      {
        code: 'marketinghub:campaign:update',
        name: 'Update Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'update',
      },
      {
        code: 'marketinghub:campaign:delete',
        name: 'Delete Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'delete',
      },
      {
        code: 'marketinghub:campaign:list',
        name: 'List Campaigns',
        type: 'feature',
        resource: 'campaign',
        action: 'list',
      },
      {
        code: 'marketinghub:analytics:read',
        name: 'Read Analytics',
        type: 'feature',
        resource: 'analytics',
        action: 'read',
      },
      {
        code: 'marketinghub:analytics:export',
        name: 'Export Analytics',
        type: 'feature',
        resource: 'analytics',
        action: 'export',
      },
    ];

    const permissions = [];
    for (const permData of permissionData) {
      const perm = await this.permissionRepository.save({
        id: uuidv4(),
        ...permData,
      });
      permissions.push(perm);
    }

    return permissions;
  }
}
