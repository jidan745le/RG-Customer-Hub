import { Injectable, Logger } from '@nestjs/common';
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

  async initializeData() {
    // Check if data already exists
    //remove
    const tenantsCount = await this.tenantRepository.count();
    if (tenantsCount > 0) {
      return;
    }

    // Create permissions
    const permissions = await this.createPermissions();

    // Create tenants
    const kendo = await this.tenantRepository.save({
      id: uuidv4(),
      name: 'Kendo',
      status: 'active',
      subscription_plan: 'enterprise',
      custom_settings: {},
    });

    const chervon = await this.tenantRepository.save({
      id: uuidv4(),
      name: 'Chervon',
      status: 'active',
      subscription_plan: 'enterprise',
      custom_settings: {},
    });

    // Create Tenant Administrator role
    const kendoAdminRole = await this.roleRepository.save({
      id: uuidv4(),
      name: 'Tenant Administrator',
      description: 'Has full access to manage the tenant',
      tenantId: kendo.id,
      isSystemRole: true,
      permissions: permissions,
    });

    const chervonAdminRole = await this.roleRepository.save({
      id: uuidv4(),
      name: 'Tenant Administrator',
      description: 'Has full access to manage the tenant',
      tenantId: chervon.id,
      isSystemRole: true,
      permissions: permissions,
    });

    // Create an admin user for Kendo
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await this.userRepository.save({
      id: uuidv4(),
      email: 'admin@kendo.com',
      name: 'Kendo Admin',
      password: hashedPassword,
      tenantId: kendo.id,
      roles: [kendoAdminRole],
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

    const marketingApp = await this.subApplicationRepository.save({
      id: uuidv4(),
      code: 'marketing',
      name: 'Marketing Center',
      description: 'Manage marketing campaigns',
      path: '/marketing',
      status: 'active',
    });

    // Assign applications to tenants by creating TenantApplication records
    await this.tenantApplicationRepository.save([
      { tenant_id: kendo.id, application_id: einvoiceApp.id, status: 'active' },
      {
        tenant_id: kendo.id,
        application_id: marketingApp.id,
        status: 'active',
      },
      {
        tenant_id: chervon.id,
        application_id: einvoiceApp.id,
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
        code: 'app:marketing:access',
        name: 'Access Marketing',
        type: 'application',
        resource: 'marketing',
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

      // Marketing permissions
      {
        code: 'marketing:campaign:create',
        name: 'Create Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'create',
      },
      {
        code: 'marketing:campaign:read',
        name: 'Read Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'read',
      },
      {
        code: 'marketing:campaign:update',
        name: 'Update Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'update',
      },
      {
        code: 'marketing:campaign:delete',
        name: 'Delete Campaign',
        type: 'feature',
        resource: 'campaign',
        action: 'delete',
      },
      {
        code: 'marketing:campaign:list',
        name: 'List Campaigns',
        type: 'feature',
        resource: 'campaign',
        action: 'list',
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
