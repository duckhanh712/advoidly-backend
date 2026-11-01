import { Logger } from '@nestjs/common';

// Keep test output readable; assertions cover the behaviour that logs would describe.
Logger.overrideLogger(false);
