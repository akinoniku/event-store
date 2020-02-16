import * as Rx from 'rxjs/operators';
import { pipe } from 'rxjs';
import * as R from 'ramda';
import { logEvent } from '../util/logEvent';
import { BaseEvent, EventFlow, EventPayloadInput } from '../EventStore.types';
import { defaultEventCreator } from '../EventStore.service';

export const getConsequentEventInputs = pipe(
  Rx.mergeMap(
    async ({
      EventFlow,
      event
    }: {
      EventFlow: EventFlow<any, any, any, any>;
      event: BaseEvent;
    }): Promise<{ consequentEventPayloadInputs: EventPayloadInput<any, any, any>[]; event: BaseEvent }> => {
      const consequentEventPayloadInputs: EventPayloadInput<any, any, any>[] = EventFlow.consequentEventInputsCreator
        ? await EventFlow.consequentEventInputsCreator(event)
        : [];
      if (consequentEventPayloadInputs.length) {
        logEvent(event, '🚼', 'sub  ', consequentEventPayloadInputs.map(R.prop('type')));
      }
      return { consequentEventPayloadInputs, event };
    }
  )
);
