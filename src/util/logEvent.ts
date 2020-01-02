import { BaseEvent } from '../Event';
import {logger} from "./PinoLogger";

export const logEvent = (event: BaseEvent, icon: string, text: string, ...moreArgs) => {
  logger.info(
    `🚥 ${icon} |${event.correlationId?.substr(-4) || '----'}|${event.causationId?.substr(-4) ||
      '----'}|${event.refId.substr(-4)}|${text}\t|${event.domain}__${event.action}: `,
    ...moreArgs
  );
};
