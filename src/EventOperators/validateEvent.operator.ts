import { pipe } from 'rxjs';
import * as Rx from 'rxjs/operators';
import { EventFlow } from '../EventStore.service';
import { logEvent } from '../util/logEvent';
import { BaseEvent } from '../Event';

export const validateEvent = pipe(
  Rx.mergeMap(
    async ([EventFlow, event]: [EventFlow<any, any, any>, BaseEvent]): Promise<{
      EventFlow: EventFlow<any, any, any>;
      event: BaseEvent;
    }> => {
      let isValidated;
      logEvent(event, '👀️', 'verify');
      isValidated = await EventFlow.validate(event);
      if (!isValidated)
        throw new Error(`Validate failed without throw error: ${event.domain}__${event.action}:${event.refId}`);
      return { event, EventFlow };
    }
  )
);
