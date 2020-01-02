import * as uuid from 'uuid/v4';

export interface BaseEvent<Payload = any, Domain = string, Action = string> {
  readonly id?: number;

  domain: Domain;
  action: Action;

  payload: Payload;

  refId?: string;
  correlationId?: string;
  causationId?: string;

  readonly created: Date;
}

export interface CreateEventInput<T> {
  payload: T;

  correlationId?: string;
  causationId?: string;
}

interface CreateEventArgs<T> extends CreateEventInput<T> {
  domain: string;
  action: string;
}

export const createDefaultEvent = <T>(eventInput: CreateEventArgs<T>): BaseEvent<T> =>
  Object.assign(
    {},
    {
      refId: uuid(),
      created: new Date()
    },
    eventInput
  );
