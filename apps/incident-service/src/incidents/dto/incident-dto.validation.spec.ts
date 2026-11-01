import { ArgumentMetadata } from '@nestjs/common';
import { AppException, createValidationPipe, FieldError } from '@app/common';
import { IncidentType } from '@app/contracts';
import { CreateIncidentDto } from './create-incident.dto';
import { ListIncidentsQueryDto, NearbyIncidentsQueryDto } from './query-incidents.dto';

const pipe = createValidationPipe();

async function validate<T>(
  metatype: new () => T,
  value: object,
  type: ArgumentMetadata['type'] = 'body',
) {
  try {
    return {
      value: (await pipe.transform(value, { type, metatype })) as T,
      fields: [] as string[],
    };
  } catch (error) {
    const details = (error as AppException).details as FieldError[];
    return { value: undefined, fields: details.map((d) => d.field).sort() };
  }
}

describe('CreateIncidentDto validation', () => {
  const valid = {
    type: IncidentType.FLOODING,
    title: 'Ngập sâu đường Nguyễn Hữu Cảnh',
    latitude: 10.788,
    longitude: 106.718,
  };

  it('accepts a minimal valid report', async () => {
    const { value, fields } = await validate(CreateIncidentDto, valid);
    expect(fields).toEqual([]);
    expect(value).toBeInstanceOf(CreateIncidentDto);
  });

  it('converts occurredAt to a Date and accepts https media', async () => {
    const { value } = await validate(CreateIncidentDto, {
      ...valid,
      occurredAt: '2026-10-31T08:00:00.000Z',
      media: [{ url: 'https://cdn.example.com/a.jpg', type: 'IMAGE' }],
    });
    expect(value?.occurredAt).toEqual(new Date('2026-10-31T08:00:00.000Z'));
  });

  it.each([
    ['latitude > 90', { latitude: 91 }, ['latitude']],
    ['longitude < -180', { longitude: -181 }, ['longitude']],
    ['latitude as text', { latitude: 'north' }, ['latitude']],
    ['an unknown type', { type: 'EARTHQUAKE' }, ['type']],
    ['a too-short title', { title: 'abc' }, ['title']],
    ['a whitespace-padded short title', { title: '   ab   ' }, ['title']],
    ['a description over 2000 chars', { description: 'x'.repeat(2001) }, ['description']],
    ['an invalid date', { occurredAt: 'yesterday' }, ['occurredAt']],
    [
      'non-https media',
      { media: [{ url: 'http://cdn.example.com/a.jpg', type: 'IMAGE' }] },
      ['media.0.url'],
    ],
    [
      'an unknown media type',
      { media: [{ url: 'https://cdn.example.com/a', type: 'GIF' }] },
      ['media.0.type'],
    ],
    [
      'more than 5 media items',
      {
        media: Array.from({ length: 6 }, () => ({
          url: 'https://cdn.example.com/a.jpg',
          type: 'IMAGE',
        })),
      },
      ['media'],
    ],
    ['a client-supplied status', { status: 'VERIFIED' }, ['status']],
    ['a client-supplied reporterId', { reporterId: 'someone-else' }, ['reporterId']],
  ])('rejects %s', async (_label, override, expected) => {
    expect((await validate(CreateIncidentDto, { ...valid, ...override })).fields).toEqual(expected);
  });

  it('requires type, title and coordinates', async () => {
    expect((await validate(CreateIncidentDto, {})).fields).toEqual([
      'latitude',
      'longitude',
      'title',
      'type',
    ]);
  });
});

describe('NearbyIncidentsQueryDto validation', () => {
  it('parses query strings and applies defaults', async () => {
    const { value, fields } = await validate(
      NearbyIncidentsQueryDto,
      { latitude: '21.0285', longitude: '105.8542', types: 'ACCIDENT,FLOODING' },
      'query',
    );
    expect(fields).toEqual([]);
    expect(value).toMatchObject({
      latitude: 21.0285,
      longitude: 105.8542,
      radiusMeters: 2000,
      limit: 50,
      types: ['ACCIDENT', 'FLOODING'],
    });
  });

  it.each([
    ['missing coordinates', {}, ['latitude', 'longitude']],
    ['latitude out of range', { latitude: '-91', longitude: '0' }, ['latitude']],
    [
      'radius above 50 km',
      { latitude: '0', longitude: '0', radiusMeters: '50001' },
      ['radiusMeters'],
    ],
    ['zero radius', { latitude: '0', longitude: '0', radiusMeters: '0' }, ['radiusMeters']],
    [
      'fractional radius',
      { latitude: '0', longitude: '0', radiusMeters: '10.5' },
      ['radiusMeters'],
    ],
    ['limit above 200', { latitude: '0', longitude: '0', limit: '201' }, ['limit']],
    ['an unknown type', { latitude: '0', longitude: '0', types: 'ACCIDENT,UFO' }, ['types']],
  ])('rejects %s', async (_label, query, expected) => {
    expect((await validate(NearbyIncidentsQueryDto, query, 'query')).fields).toEqual(expected);
  });
});

describe('ListIncidentsQueryDto bounding box validation', () => {
  const bbox = { minLat: '20.9', minLng: '105.7', maxLat: '21.1', maxLng: '105.9' };

  it('accepts a complete bounding box', async () => {
    const { value, fields } = await validate(ListIncidentsQueryDto, bbox, 'query');
    expect(fields).toEqual([]);
    expect(value).toMatchObject({ minLat: 20.9, maxLng: 105.9, page: 1, limit: 20 });
  });

  it('accepts no bounding box at all', async () => {
    expect((await validate(ListIncidentsQueryDto, {}, 'query')).fields).toEqual([]);
  });

  it('requires all four corners once any is given', async () => {
    expect((await validate(ListIncidentsQueryDto, { minLat: '20.9' }, 'query')).fields).toEqual([
      'maxLat',
      'maxLng',
      'minLng',
    ]);
  });

  it('rejects inverted corners', async () => {
    const inverted = { ...bbox, maxLat: '20.0', maxLng: '105.0' };
    expect((await validate(ListIncidentsQueryDto, inverted, 'query')).fields).toEqual([
      'maxLat',
      'maxLng',
    ]);
  });
});
