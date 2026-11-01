import { Logger } from '@nestjs/common';
import { logLevel, LogEntry } from 'kafkajs';

/** Routes kafkajs logs through the Nest (pino) logger. */
export const kafkaLogCreator = () => {
  const logger = new Logger('KafkaJS');
  return ({ level, log }: LogEntry) => {
    const { message, ...extra } = log;
    const line = `${message} ${JSON.stringify(extra)}`;
    if (level === logLevel.ERROR || level === logLevel.NOTHING) logger.error(line);
    else if (level === logLevel.WARN) logger.warn(line);
    else logger.debug(line);
  };
};
