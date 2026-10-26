/** An error with the HTTP status that the API returns for it. */
export class ServiceError extends Error {
    /** The HTTP status: 400, 401, 403, 404, 409 or 429. */
    readonly status: 400 | 401 | 403 | 404 | 409 | 429;

    /**
     * @param status the HTTP status
     * @param message the error text
     */
    constructor(status: 400 | 401 | 403 | 404 | 409 | 429, message: string) {
        super(message);
        this.status = status;
    }
}

/**
 * Creates a not found error.
 *
 * @param what the name of the missing thing
 */
export function notFound(what: string): ServiceError {
    return new ServiceError(404, `${what} not found`);
}
