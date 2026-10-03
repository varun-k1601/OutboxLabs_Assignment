import type { z } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message = 'Not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }

  static serviceUnavailable(message: string) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message);
  }
}

// validate with zod, throws a 400 with the field errors
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw AppError.badRequest(details[0]?.message ?? 'Invalid request', details);
  }
  return result.data;
}

// postgres unique_violation
export function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: unknown })?.cause ?? err;
  return (cause as { code?: string })?.code === '23505' || (err as { code?: string })?.code === '23505';
}
