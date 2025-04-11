import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { TenantApplication } from './tenant-application.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 20 })
  status: string;

  @Column({ length: 50, nullable: true })
  subscription_plan: string;

  @Column({ type: 'json', nullable: true })
  custom_settings: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(
    () => TenantApplication,
    (tenantApplication) => tenantApplication.tenant,
  )
  tenantApplications: TenantApplication[];
}
