import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/** Validates that the decorated number is strictly greater than another property. */
export function IsGreaterThan(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isGreaterThan',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: { message: `${propertyName} must be greater than ${property}`, ...options },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[args.constraints[0] as string];
          return typeof value === 'number' && typeof other === 'number' && value > other;
        },
      },
    });
}

/** Accepts `a,b` and repeated query params (`?x=a&x=b`) as a string array. */
export const toStringArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
};

export const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;
