import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantApplication } from './tenant-application.entity';

@Entity('sub_applications')
export class SubApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 100, unique: true })
  path: string;

  @Column({ length: 100, nullable: true, unique: true })
  subdomain: string;

  @Column({ length: 100, nullable: true })
  url: string;

  @Column({ length: 20 })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(
    () => TenantApplication,
    (tenantApplication) => tenantApplication.application,
  )
  tenantApplications: TenantApplication[];
}
