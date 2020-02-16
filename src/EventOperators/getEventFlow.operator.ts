import * as Rx from 'rxjs/operators';
import { pipe } from 'rxjs';
import { EventFlowMap } from '../EventStore.service';
import { BaseEvent, EventFlow } from '../EventStore.types';

// logger.info(`🚥 🎢 |${event.correlationId?.substr(-4) || '----'}|${event.causationId?.substr(-4) || '----'}|${event.refId.substr(-4)}|flow processing\t|${event.domain}__${event.action}: `);
export const getEventFlow = pipe(
  Rx.map(
    ({ event, eventFlowMap }: { event: BaseEvent; eventFlowMap: EventFlowMap }): EventFlow<any, any, any, any> => {
      const getEventKey = (event: BaseEvent) => event.domain + '__' + event.type;
      const key = getEventKey(event);
      const eventFlow = eventFlowMap[key];
      if (!eventFlow) {
        throw new Error(`Event Flow (${key}) not found`);
      }
      return eventFlow;
    }
  )
);
