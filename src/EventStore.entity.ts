import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Repository } from 'typeorm';

@Entity()
export class EventStoreEntity {
  @PrimaryGeneratedColumn()
  readonly id: number;

  @Column('varchar', { length: 15 })
  domain: string;

  @Column('varchar', { length: 15 })
  action: string;

  @Column('text')
  payload: string;

  @Column('varchar', { length: 36 })
  refId: string; //uuid

  @Column('varchar', { nullable: true, length: 36 })
  correlationId: string; //uuid

  @Column('varchar', { nullable: true, length: 36 })
  causationId: string; //uuid

  @CreateDateColumn()
  readonly created: Date;
}
