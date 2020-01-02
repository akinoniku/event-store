import * as Rx from 'rxjs/operators';
import { pipe } from 'rxjs';
import * as R from 'ramda';
import { EventFlow } from '../EventStore.service';
import { logEvent } from '../util/logEvent';
import { BaseEvent } from '../Event';

export const getConsequentEvent = pipe(
  Rx.mergeMap(
    async ({
      EventFlow,
      event
    }: {
      EventFlow: EventFlow<any, any, any>;
      event: BaseEvent<any>;
    }): Promise<{ consequentEvents: BaseEvent[]; event: BaseEvent }> => {
      const consequentEvents = EventFlow.createConsequentEvents ? await EventFlow.createConsequentEvents(event) : [];
      if (consequentEvents.length) {
        logEvent(event, '🚼', 'sub  ', consequentEvents.map(R.prop('action')));
      }
      return { consequentEvents, event };
    }
  )
);
