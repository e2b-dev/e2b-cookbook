const never = Symbol();
export class ApiError extends Error {
    constructor(response) {
        super(response.statusText);
        Object.defineProperty(this, "headers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "url", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "statusText", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.setPrototypeOf(this, new.target.prototype);
        this.headers = response.headers;
        this.url = response.url;
        this.status = response.status;
        this.statusText = response.statusText;
        this.data = response.data;
    }
}
