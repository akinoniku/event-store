import {EventFlow, EventFlowMap} from "./EventStore.service";

const getEventFlowKey = (eventFlow: EventFlow<any, any, any>) =>
  eventFlow.domain + '__' + eventFlow.action;

const registerEventFlowType = (eventFlowMap: EventFlowMap, eventFlow: EventFlow<any, any, any>) => {
  const key = getEventFlowKey(eventFlow);
  if (!!eventFlowMap[key]) {
    throw new Error(`Event Flow (${key}) is already registered.`)
  }
  return Object.assign({}, eventFlowMap, {[key]: eventFlow})
};

export const registerEventFlowTypes = (eventFlowMap: EventFlowMap, eventFlows: EventFlow<any, any, any>[]) =>
  eventFlows.reduce((lastMap, currentEventFlow) =>
      registerEventFlowType(lastMap, currentEventFlow)
    , eventFlowMap);

