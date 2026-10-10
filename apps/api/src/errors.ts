/** Errors returned to clients as `{ code, message, requestId }` (SYSTEM_DESIGN §6). */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const forbidden = (message = "Your role cannot do this.") => new AppError(403, "FORBIDDEN", message);
export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
