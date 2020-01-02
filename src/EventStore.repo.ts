import { Connection, Repository } from 'typeorm';
import { EventStoreEntity } from './EventStore.entity';
import { ConnectionOptions } from 'typeorm';
import { BaseEvent } from './Event';
import {getConnection} from "./util/getConnection";

export class EventStoreRepo {
  public repo: Repository<EventStoreEntity>;
  public conn: Connection;

  constructor(private connectionOptions: ConnectionOptions) {}

  async init() {
    if (!this.conn) {
      this.conn = await getConnection([EventStoreEntity], this.connectionOptions);
      this.repo = this.conn.getRepository<EventStoreEntity>(EventStoreEntity);
    }
  }

  async getAllEvents(page: number): Promise<EventStoreEntity[]> {
    await this.init();
    const take = 100;
    const skip = take * page;
    return await this.repo.find({
      order: {
        id: 'ASC'
      },
      take,
      skip
    });
  }

  storeEvent = async <T>(event: BaseEvent<T>) => {
    await this.init();
    const newEventEntity = new EventStoreEntity();
    const { refId, domain, action, payload, correlationId, causationId } = event;

    Object.assign(newEventEntity, {
      refId,
      domain,
      action,
      correlationId,
      causationId
    });

    newEventEntity.payload = JSON.stringify(payload);

    await this.repo.save(newEventEntity);
  };

  storeEvents = async <T>(events: BaseEvent<T>[]) => {
    await this.init();
    // TODO transaction
    await Promise.all(events.map(this.storeEvent.bind(this)));
  };
}
