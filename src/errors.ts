export class MarkitdownError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MarkitdownError';
    }
}

export class FileConversionError extends MarkitdownError {
    constructor(message: string, public readonly filePath: string) {
        super(message);
        this.name = 'FileConversionError';
    }
}

export class FileSystemError extends MarkitdownError {
    constructor(message: string, public readonly path: string) {
        super(message);
        this.name = 'FileSystemError';
    }
}

export class ConfigurationError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigurationError';
    }
}

export class DependencyError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'DependencyError';
    }
}

export class MonitoringError extends MarkitdownError {
    constructor(message: string, public readonly folderPath: string) {
        super(message);
        this.name = 'MonitoringError';
    }
}

export class ArchiveError extends MarkitdownError {
    constructor(message: string, public readonly filePath: string) {
        super(message);
        this.name = 'ArchiveError';
    }
}

export class ValidationError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class NetworkError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class TimeoutError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class PermissionError extends MarkitdownError {
    constructor(message: string, public readonly path: string) {
        super(message);
        this.name = 'PermissionError';
    }
}

export class ResourceNotFoundError extends MarkitdownError {
    constructor(message: string, public readonly resource: string) {
        super(message);
        this.name = 'ResourceNotFoundError';
    }
}

export class DuplicateResourceError extends MarkitdownError {
    constructor(message: string, public readonly resource: string) {
        super(message);
        this.name = 'DuplicateResourceError';
    }
}

export class StateError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'StateError';
    }
}

export class OperationCancelledError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'OperationCancelledError';
    }
}

export class InvalidOperationError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidOperationError';
    }
}

export class DataIntegrityError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'DataIntegrityError';
    }
}

export class ResourceExhaustedError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'ResourceExhaustedError';
    }
}

export class UnsupportedOperationError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedOperationError';
    }
}

export class AuthenticationError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'AuthorizationError';
    }
}

export class RateLimitError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}

export class ServiceUnavailableError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'ServiceUnavailableError';
    }
}

export class BadGatewayError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'BadGatewayError';
    }
}

export class GatewayTimeoutError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'GatewayTimeoutError';
    }
}

export class InternalServerError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'InternalServerError';
    }
}

export class NotImplementedError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'NotImplementedError';
    }
}

export class BadRequestError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'BadRequestError';
    }
}

export class NotFoundError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class MethodNotAllowedError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'MethodNotAllowedError';
    }
}

export class ConflictError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}

export class GoneError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'GoneError';
    }
}

export class LengthRequiredError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'LengthRequiredError';
    }
}

export class PreconditionFailedError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'PreconditionFailedError';
    }
}

export class PayloadTooLargeError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'PayloadTooLargeError';
    }
}

export class URITooLongError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'URITooLongError';
    }
}

export class UnsupportedMediaTypeError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedMediaTypeError';
    }
}

export class RangeNotSatisfiableError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'RangeNotSatisfiableError';
    }
}

export class ExpectationFailedError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'ExpectationFailedError';
    }
}

export class ImATeapotError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'ImATeapotError';
    }
}

export class MisdirectedRequestError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'MisdirectedRequestError';
    }
}

export class UnprocessableEntityError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'UnprocessableEntityError';
    }
}

export class LockedError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'LockedError';
    }
}

export class FailedDependencyError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'FailedDependencyError';
    }
}

export class TooEarlyError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'TooEarlyError';
    }
}

export class UpgradeRequiredError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'UpgradeRequiredError';
    }
}

export class PreconditionRequiredError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'PreconditionRequiredError';
    }
}

export class TooManyRequestsError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'TooManyRequestsError';
    }
}

export class RequestHeaderFieldsTooLargeError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'RequestHeaderFieldsTooLargeError';
    }
}

export class UnavailableForLegalReasonsError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'UnavailableForLegalReasonsError';
    }
}

export class InternalClientError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'InternalClientError';
    }
}

export class NotExtendedError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'NotExtendedError';
    }
}

export class NetworkAuthenticationRequiredError extends MarkitdownError {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkAuthenticationRequiredError';
    }
} 