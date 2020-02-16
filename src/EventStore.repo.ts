import { Connection, Repository } from 'typeorm';
import { EventStoreEntity } from './EventStore.entity';
import { ConnectionOptions } from 'typeorm';
import { getConnection } from './util/getConnection';
import { BaseEvent } from './EventStore.types';

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

  storeEvent = async (event: BaseEvent) => {
    await this.init();
    const newEventEntity = new EventStoreEntity();
    const { trackingId, domain, type, payload, input, created, correlationId, causationId } = event;

    Object.assign(newEventEntity, {
      trackingId,
      domain,
      type,
      correlationId,
      causationId,
      created
    });

    newEventEntity.payload = JSON.stringify(payload);
    newEventEntity.input = JSON.stringify(input);

    await this.repo.save(newEventEntity);
  };

  storeEvents = async (events: BaseEvent[]) => {
    await this.init();
    // TODO transaction
    await Promise.all(events.map(this.storeEvent.bind(this)));
  };
}
