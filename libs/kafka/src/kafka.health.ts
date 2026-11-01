import { Injectable, Optional } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { EventConsumer } from './event-consumer.service';
import { EventPublisher } from './event-publisher.service';

@Injectable()
export class KafkaHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly publisher: EventPublisher,
    @Optional() private readonly consumer?: EventConsumer,
  ) {}

  check(key = 'kafka') {
    const indicator = this.health.check(key);
    const details = {
      producerConnected: this.publisher.isConnected,
      consumerRunning: this.consumer?.isRunning ?? false,
    };
    // A service that consumes events is only healthy while its consumer is running.
    const consumerOk = !this.consumer?.hasHandlers || details.consumerRunning;
    return details.producerConnected && consumerOk
      ? indicator.up(details)
      : indicator.down(details);
  }
}
