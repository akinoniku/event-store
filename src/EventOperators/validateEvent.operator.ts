import { pipe } from 'rxjs';
import * as Rx from 'rxjs/operators';
import { logEvent } from '../util/logEvent';
import { BaseEvent, EventFlow } from '../EventStore.types';

export const validateEvent = pipe(
  Rx.mergeMap(
    async ([EventFlow, event]: [EventFlow<any, any, any, any>, BaseEvent]): Promise<{
      EventFlow: EventFlow<any, any, any, any>;
      event: BaseEvent;
    }> => {
      logEvent(event, '👀️', 'verify');
      const error = EventFlow.validator ? await EventFlow.validator(event) : undefined;
      if (error instanceof Error) throw error;
      return { event, EventFlow };
    }
  )
);
