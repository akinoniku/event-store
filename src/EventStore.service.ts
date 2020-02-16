import { Job, Queue } from 'bull';
import { Connection, ConnectionOptions } from 'typeorm';
import { registerEventFlowTypes } from './EventFlow.register';
import * as uuid from 'uuid/v4';
import * as R from 'ramda';
import { EventQueue } from './queue/EventQueue';
import { logEvent } from './util/logEvent';
import * as Rx from 'rxjs/operators';
import { Observable, of, OperatorFunction, zip } from 'rxjs';
import { validateEvent } from './EventOperators/validateEvent.operator';
import { getConsequentEventInputs } from './EventOperators/getConsequentEvent.opeartor';
import { EventStoreRepo } from './EventStore.repo';
import { logger } from './util/PinoLogger';
import { BaseEvent, CreatedEvent, EventArgs, EventFlow, EventPayloadInput } from './EventStore.types';

export interface EventFlowMap {
  [key: string]: EventFlow<any, any, any, any>;
}

const getEventKey = (event: EventPayloadInput<any, any, any>) => event.domain + '__' + event.type;

const getEventFlow = (eventFlowMap: EventFlowMap, eventPayloadArgs: EventPayloadInput<any, any, any>) => {
  const key = getEventKey(eventPayloadArgs);
  return eventFlowMap[key];
};

const applyEvent = (
  applyQueue: Queue<BaseEvent>,
  eventFlowMap: EventFlowMap
): OperatorFunction<any, BaseEvent | Error> => ($input: Observable<Job<BaseEvent>>) =>
  $input.pipe(
    Rx.mergeMap((job: Job<BaseEvent>) => {
      const event = job.data;
      const EventFlow = getEventFlow(eventFlowMap, event);
      return of([EventFlow, event]).pipe(
        validateEvent,
        Rx.mergeMap(async ({ event, EventFlow }) => {
          logEvent(event, '🉑️️', 'Apply');
          if (EventFlow.executor) {
            await EventFlow.executor(event);
          }
          return { EventFlow, event };
        }),
        getConsequentEventInputs,
        Rx.flatMap(async ({ consequentEventPayloadInputs, event }) => {
          await consequentEventPayloadInputs.reduce<Promise<any>>(async (acc, currentEventPayloadInput) => {
            if (acc) await acc;
            const eventFlow = getEventFlow(eventFlowMap, currentEventPayloadInput);
            const payload = eventFlow.eventPayloadCreator
              ? await eventFlow.eventPayloadCreator(currentEventPayloadInput)
              : currentEventPayloadInput.input;
            const currentEvent = defaultEventCreator(
              {
                ...currentEventPayloadInput,
                payload
              },
              event
            );
            await applyQueue.add(currentEvent);
          }, null);
          return event;
        }),
        Rx.catchError((validateError, ob$) => {
          logEvent(event, '⚠️', 'Invalid', validateError);
          return of(validateError);
        })
      );
    })
  );

export function defaultEventCreator<Domain, Type, Input, Payload>(
  eventArgs: EventArgs<Domain, Type, Input, Payload>,
  causalEvent?: CreatedEvent<any, any, any, any>
): CreatedEvent<Domain, Type, Input, Payload> {
  return {
    ...eventArgs,

    trackingId: eventArgs.trackingId || uuid(),
    causationId: eventArgs.causationId || causalEvent ? causalEvent.trackingId : undefined,
    correlationId:
      eventArgs.correlationId || causalEvent ? causalEvent.correlationId || causalEvent.trackingId : undefined,

    created: new Date()
  };
}

export class EventStoreService {
  private readonly eventFlowMap: EventFlowMap;
  private readonly eventQueue: EventQueue;
  private readonly eventStoreRepo: EventStoreRepo;

  constructor(
    private eventFlows: EventFlow<any, any, any, any>[],
    private connectionOptions: ConnectionOptions,
    private redisConnectString: string,
    private readonly name = 'default'
  ) {
    this.eventFlowMap = registerEventFlowTypes({}, eventFlows);
    if (process.env.NODE_ENV === 'test' && name === 'test') {
      this.name = 'test:' + uuid().substr(-4);
    }
    this.eventQueue = new EventQueue(this.name, { redis: this.redisConnectString });
    this.eventStoreRepo = new EventStoreRepo(this.connectionOptions);
    this.startQueue();
  }

  private startQueue() {
    const { waitPackage, applyPackage, applyQueue, waitQueue } = this.eventQueue;
    waitPackage.job$.pipe(Rx.tap(job => applyQueue.add(job.data))).subscribe();

    const applyDrained$ = zip(
      applyPackage.job$.pipe(applyEvent(applyQueue, this.eventFlowMap)),
      applyPackage.done$
    ).pipe(
      Rx.tap(([res, done]) => done(res instanceof Error ? res : null)),
      Rx.map(([res, done]) => res),
      Rx.buffer(applyPackage.drained$),
      Rx.tap(res => {
        if (res instanceof Error) {
          applyQueue.empty();
        }
      })
    );

    zip(waitPackage.done$, applyDrained$)
      .pipe(
        Rx.mergeMap(async ([done, eventsAndMaybeError]) => {
          const lastOne: Error | BaseEvent = R.last(eventsAndMaybeError);
          const isLastOneError = lastOne instanceof Error;
          if (isLastOneError) {
            // roll backing
            const events = R.filter(current => !(current instanceof Error))(eventsAndMaybeError) as BaseEvent[];
            await events.reduce<Promise<any>>(async (acc, currentEvent) => {
              if (acc) await acc;
              const EventFlow = getEventFlow(this.eventFlowMap, currentEvent);
              logEvent(currentEvent, '❌', 'cancel');
              EventFlow.executorCanceler && (await EventFlow.executorCanceler(currentEvent));
            }, null);
          } else {
            const events = eventsAndMaybeError as BaseEvent[];
            R.map(event => logEvent(event, '📝', 'persist'), events);
            await this.eventStoreRepo.storeEvents(events);
          }

          done(lastOne instanceof Error ? lastOne : null);
        })
      )
      .subscribe();
  }

  async receiveEventInput(eventPayloadArgs: EventPayloadInput<any, any, any>): Promise<BaseEvent> {
    const eventFlow = getEventFlow(this.eventFlowMap, eventPayloadArgs);

    if (!eventFlow) {
      logger.warn(`${eventPayloadArgs.domain}|${eventPayloadArgs.type} is not known event.`);
    }

    const payload = eventFlow.eventPayloadCreator
      ? await eventFlow.eventPayloadCreator(eventPayloadArgs)
      : eventPayloadArgs.input;
    const eventArgs = { ...eventPayloadArgs, payload };
    const event = defaultEventCreator<any, any, any, any>(eventArgs);
    const job = await this.eventQueue.waitQueue.add(event);
    await job.finished();
    return event;
  }

  async replay() {
    let page = 0;
    logger.info('replay starting');
    while (true) {
      const events = await this.eventStoreRepo.getAllEvents(page);
      if (events.length > 0) {
        logger.info(`page, ${page}. replaying ${events.length}`);
        await events.reduce<Promise<any>>(async (acc, currentEvent) => {
          if (acc) await acc;
          const EventFlow = getEventFlow(this.eventFlowMap, currentEvent);
          currentEvent.payload = JSON.parse(currentEvent.payload);
          logEvent(currentEvent, '🉑️️', 'Apply');
          const result = await EventFlow.executor(currentEvent);
        }, null);
        page++;
      } else {
        logger.info(`replay finished pages ${page}`);
        break;
      }
    }
  }

  async getDbConnection(): Promise<Connection> {
    if (!this.eventStoreRepo.conn) {
      await this.eventStoreRepo.init();
    }
    return this.eventStoreRepo.conn;
  }
}
