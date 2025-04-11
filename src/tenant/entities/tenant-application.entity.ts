import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubApplication } from './sub-application.entity';
import { Tenant } from './tenant.entity';

@Entity('tenant_applications')
export class TenantApplication {
  @PrimaryColumn()
  tenant_id: string;

  @PrimaryColumn()
  application_id: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ type: 'json', nullable: true })
  settings: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.tenantApplications)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(
    () => SubApplication,
    (application) => application.tenantApplications,
  )
  @JoinColumn({ name: 'application_id' })
  application: SubApplication;
}
