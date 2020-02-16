import { logger } from './PinoLogger';
import { BaseEvent } from '../EventStore.types';

export const logEvent = (event: BaseEvent, icon: string, text: string, ...moreArgs) => {
  logger.info(
    `🚥 ${icon} |${event.correlationId?.substr(-4) || '----'}|${event.causationId?.substr(-4) ||
      '----'}|${event.trackingId.substr(-4)}|${text}\t|${event.domain}__${event.type}: `,
    ...moreArgs
  );
};
