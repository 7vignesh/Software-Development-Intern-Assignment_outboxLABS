import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Generic validation middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (cleaned) data and calls next().
 * On failure, returns 400 with descriptive field-level error messages.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      res.status(400).json({
        error: 'Validation failed',
        details: formatted,
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Formats Zod errors into a field-level error map.
 * Each key is the field path (dot-separated for nested fields),
 * and the value is an array of error messages for that field.
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }

  return details;
}
