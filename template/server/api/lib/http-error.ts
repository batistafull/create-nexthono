import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Error type controllers/services throw to signal an HTTP failure. */
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m = "Bad Request") => new HttpError(400, m);
export const unauthorized = (m = "Unauthorized") => new HttpError(401, m);
export const forbidden = (m = "Forbidden") => new HttpError(403, m);
export const notFound = (m = "Not Found") => new HttpError(404, m);
export const conflict = (m = "Conflict") => new HttpError(409, m);
