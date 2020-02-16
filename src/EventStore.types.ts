namespace A {}

export interface EventPayloadInput<Domain, Type, Input> {
  domain: Domain;
  type: Type;
  input: Input;

  trackingId?: string;
}

export interface EventArgs<Domain, Type, Input, Payload> extends EventPayloadInput<Domain, Type, Input> {
  payload: Payload;

  correlationId?: string;
  causationId?: string;
}

export interface CreatedEvent<Domain, Type, Input, Payload> extends EventArgs<Domain, Type, Input, Payload> {
  trackingId: string;
  readonly created: Date;
}

export interface StoredEvent<Domain, Type, Input, Payload> extends CreatedEvent<Domain, Type, Input, Payload> {
  readonly id?: number;
}

export type Event<Domain, Type, Input, Payload> = StoredEvent<Domain, Type, Input, Payload>;

export interface EventFlow<Domain, Type, Input, Payload = Input> {
  domain: Domain;
  type: Type;

  eventPayloadCreator?: (eventInputArgs: EventPayloadInput<Domain, Type, Input>) => Promise<Payload>;
  consequentEventInputsCreator?: (
    causalEvent: CreatedEvent<Domain, Type, Input, Payload>
  ) => Promise<EventPayloadInput<any, any, any>[]>;
  validator?: (event: CreatedEvent<Domain, Type, Input, Payload>) => Promise<Error | void>;
  executor?: (event: CreatedEvent<Domain, Type, Input, Payload>) => Promise<void>;
  executorCanceler?: (event: CreatedEvent<Domain, Type, Input, Payload>) => Promise<void>;
  sideEffect?: (event: CreatedEvent<Domain, Type, Input, Payload>) => Promise<void>;
}

class EventFlowClass {
  domain: string;
}

export interface ReceiveEventInputType<Domain, Type, Input, Payload = Input> {
  (eventPayloadArgs: EventPayloadInput<Domain, Type, Input>): Promise<StoredEvent<Domain, Type, Input, Payload>>;
}

export type BaseEvent = CreatedEvent<any, any, any, any>;
