import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_EVENT_TYPES, EVENT_VERSIONS, topicFor } from './index';

describe('Kafka topic provisioning', () => {
  const provisioned = readFileSync(
    join(__dirname, '../../../../infrastructure/kafka/topics.txt'),
    'utf8',
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  it('provisions a topic for every event type and nothing else', () => {
    expect([...provisioned].sort()).toEqual(ALL_EVENT_TYPES.map(topicFor).sort());
  });

  it('declares a schema version for every event type', () => {
    expect(Object.keys(EVENT_VERSIONS).sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });
});
