import { Job, Queue } from 'bull';
import { Connection, ConnectionOptions } from 'typeorm';
import { registerEventFlowTypes } from './EventFlow.register';
import * as uuid from 'uuid/v4';
import * as R from 'ramda';
import { EventQueue, EventQueueType } from './queue/EventQueue';
import { logEvent } from './util/logEvent';
import * as Rx from 'rxjs/operators';
import { Observable, OperatorFunction, of, zip } from 'rxjs';
import { validateEvent } from './EventOperators/validateEvent.operator';
import { getConsequentEvent } from './EventOperators/getConsequentEvent.opeartor';
import { BaseEvent, CreateEventInput } from './Event';
import { EventStoreRepo } from './EventStore.repo';
import {logger} from "./util/PinoLogger";

export interface EventFlowMap {
  [key: string]: EventFlow<any, any, any>;
}

export interface EventFlow<Domain, Action, Payload> {
  domain: Domain;
  action: Action;
  createEvent: (createEventInput: CreateEventInput<Payload>) => Promise<BaseEvent<Payload>>;
  createConsequentEvents?: (causalEvent: BaseEvent<Payload>) => Promise<BaseEvent<any>[]>;
  validate: (event: BaseEvent<Payload>) => Promise<boolean>;
  process: (event: BaseEvent<Payload>) => Promise<boolean>;
  processCancel?: (event: BaseEvent<Payload>) => Promise<boolean>;
  sideEffect?: (event: BaseEvent<Payload>) => Promise<void>;
}

const getEventKey = (event: BaseEvent<any>) => event.domain + '__' + event.action;

const getEventFlowOld = (eventFlowMap: EventFlowMap, event: BaseEvent<any>) => {
  const key = getEventKey(event);
  const eventFlow = eventFlowMap[key];
  if (!eventFlow) {
    throw new Error(`Event Flow (${key}) not found`);
  }
  return eventFlow;
};

const applyEvent = (
  applyQueue: Queue<BaseEvent>,
  eventFlowMap: EventFlowMap
): OperatorFunction<any, BaseEvent | Error> => ($input: Observable<Job<BaseEvent>>) =>
  $input.pipe(
    Rx.mergeMap((job: Job<BaseEvent>) => {
      const event = job.data;
      const EventFlow = getEventFlowOld(eventFlowMap, event);
      return of([EventFlow, event]).pipe(
        validateEvent,
        Rx.mergeMap(async ({ event, EventFlow }) => {
          logEvent(event, '🉑️️', 'Apply');
          await EventFlow.process(event);
          return { EventFlow, event };
        }),
        getConsequentEvent,
        Rx.flatMap(async ({ consequentEvents, event }) => {
          await consequentEvents.reduce<Promise<any>>(async (acc, currentEvent) => {
            if (acc) await acc;
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

export class EventStoreService {
  private readonly eventFlowMap: EventFlowMap;
  private readonly eventQueue: EventQueue;
  private readonly eventStoreRepo: EventStoreRepo;

  constructor(
    private eventFlows: EventFlow<any, any, any>[],
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
            const events = R.slice(0, -1)(eventsAndMaybeError) as BaseEvent[];
            await events.reduce<Promise<any>>(async (acc, currentEvent) => {
              if (acc) await acc;
              const EventFlow = getEventFlowOld(this.eventFlowMap, currentEvent);
              logEvent(currentEvent, '❌', 'cancel');
              EventFlow.processCancel && (await EventFlow.processCancel(currentEvent));
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

  async receiveEvent(event: BaseEvent<any>): Promise<BaseEvent<any>> {
    logEvent(event, '📩', 'receive');

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
          const EventFlow = getEventFlowOld(this.eventFlowMap, currentEvent);
          currentEvent.payload = JSON.parse(currentEvent.payload);
          logEvent(currentEvent, '🉑️️', 'Apply');
          const result = await EventFlow.process(currentEvent);
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
