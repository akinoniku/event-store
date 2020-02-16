import { EventFlowMap } from './EventStore.service';
import { EventFlow } from './EventStore.types';

const getEventFlowKey = (eventFlow: EventFlow<any, any, any, any>) => eventFlow.domain + '__' + eventFlow.type;

const registerEventFlowType = (eventFlowMap: EventFlowMap, eventFlow: EventFlow<any, any, any, any>) => {
  const key = getEventFlowKey(eventFlow);
  if (!!eventFlowMap[key]) {
    // todo fix me
    // throw new Error(`Event Flow (${key}) is already registered.`)
  }
  return Object.assign({}, eventFlowMap, { [key]: eventFlow });
};

export const registerEventFlowTypes = (eventFlowMap: EventFlowMap, eventFlows: EventFlow<any, any, any, any>[]) =>
  eventFlows.reduce((lastMap, currentEventFlow) => registerEventFlowType(lastMap, currentEventFlow), eventFlowMap);
