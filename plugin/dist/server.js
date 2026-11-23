import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/server/main.ts
import { readFile } from "node:fs/promises";
import { extname as extname2, join as join16, normalize, sep as sep3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// node_modules/@hono/node-server/dist/constants-BLSFu_RU.mjs
var X_ALREADY_SENT = "x-hono-already-sent";

// node_modules/@hono/node-server/dist/index.mjs
import { STATUS_CODES, ServerResponse, createServer } from "node:http";
import { Http2ServerRequest, constants } from "node:http2";
import { Readable } from "node:stream";

// node_modules/hono/dist/helper/websocket/index.js
var defineWebSocketHelper = (handler) => {
  return ((...args) => {
    if (typeof args[0] === "function") {
      const [createEvents, options] = args;
      return async function upgradeWebSocket2(c, next) {
        const result = await handler(c, await createEvents(c), options);
        if (result) return result;
        await next();
      };
    } else {
      const [c, events, options] = args;
      return (async () => {
        const upgraded = await handler(c, events, options);
        if (!upgraded) throw new Error("Failed to upgrade WebSocket");
        return upgraded;
      })();
    }
  });
};

// node_modules/@hono/node-server/dist/index.mjs
var RequestError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RequestError";
  }
};
var nonJoinedHeaders = /* @__PURE__ */ new Set([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "server",
  "user-agent"
]);
var validHeaderName = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;
var isHttpWhitespace = (code) => code === 9 || code === 10 || code === 13 || code === 32;
var normalizeHeaderValue = (value) => {
  if (!isHttpWhitespace(value.charCodeAt(0)) && !isHttpWhitespace(value.charCodeAt(value.length - 1))) return value;
  let start = 0;
  let end = value.length;
  while (start < end && isHttpWhitespace(value.charCodeAt(start))) start++;
  while (end > start && isHttpWhitespace(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
};
var forbiddenHeaderValue = /[\0\r\n]/;
var GlobalHeaders = globalThis.Headers;
var materializeHeaders = (rawHeaders, HeadersCtor = GlobalHeaders) => {
  const headers = new HeadersCtor();
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i];
    if (!name.startsWith(":")) headers.append(name, rawHeaders[i + 1]);
  }
  return headers;
};
var RequestHeaders = class {
  #incoming;
  #rawHeaders;
  #headers;
  #invalidValue;
  constructor(incoming) {
    this.#incoming = incoming;
    if (incoming instanceof Http2ServerRequest) this.#rawHeaders = incoming.rawHeaders.slice();
  }
  get #lazyRawHeaders() {
    return this.#rawHeaders ??= this.#incoming.rawHeaders.slice();
  }
  get #native() {
    if (!this.#headers) {
      this.#headers = materializeHeaders(this.#lazyRawHeaders);
      this.#rawHeaders = void 0;
    }
    return this.#headers;
  }
  #normalizedName(name) {
    if (typeof name !== "string") return;
    if (!validHeaderName.test(name)) throw new TypeError(`Invalid header name: ${name}`);
    return name.toLowerCase();
  }
  #lookupHttp1(lowerName) {
    const headers = this.#incoming instanceof Http2ServerRequest ? void 0 : this.#incoming.headers;
    if (!headers || nonJoinedHeaders.has(lowerName) || lowerName === "set-cookie" || lowerName === "__proto__") return;
    if (!Object.hasOwn(headers, lowerName)) return null;
    const rawValue = headers[lowerName];
    if (typeof rawValue === "string") {
      const value = normalizeHeaderValue(rawValue);
      return forbiddenHeaderValue.test(value) ? void 0 : value;
    }
  }
  #lookup(rawHeaders, lowerName) {
    const separator = lowerName === "cookie" ? "; " : ", ";
    let value = null;
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const rawName = rawHeaders[i];
      if (rawName.length === lowerName.length && rawName.toLowerCase() === lowerName) {
        const rawValue = normalizeHeaderValue(rawHeaders[i + 1]);
        if (forbiddenHeaderValue.test(rawValue)) {
          this.#invalidValue = true;
          return;
        }
        value = value === null ? rawValue : value + separator + rawValue;
      }
    }
    return value;
  }
  append(name, value) {
    this.#native.append(name, value);
  }
  delete(name) {
    this.#native.delete(name);
  }
  get(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value;
    }
    return this.#native.get(name);
  }
  has(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value !== null;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value !== null;
    }
    return this.#native.has(name);
  }
  set(name, value) {
    this.#native.set(name, value);
  }
  getSetCookie() {
    return this.#native.getSetCookie();
  }
  keys() {
    return this.#native.keys();
  }
  values() {
    return this.#native.values();
  }
  entries() {
    return this.#native.entries();
  }
  forEach(callback, thisArg) {
    this.#native.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }
  [Symbol.iterator]() {
    return this.entries();
  }
};
Object.defineProperty(RequestHeaders.prototype, /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Headers (lightweight) ${inspectFn(Object.fromEntries(this), {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(RequestHeaders.prototype, GlobalHeaders.prototype);
var newHeadersFromIncoming = (incoming) => globalThis.Headers === GlobalHeaders ? new RequestHeaders(incoming) : materializeHeaders(incoming.rawHeaders, globalThis.Headers);
var reValidRequestUrl = /^\/[!#$&-;=?-\[\]_a-z~]*$/;
var reDotSegment = /\/\.\.?(?:[/?#]|$)/;
var reValidHost = /^[a-z0-9._-]+(?::(?:[1-5]\d{3,4}|[6-9]\d{3}))?$/;
var validateRequestTarget = (target) => {
  const backslash = target.indexOf("\\");
  if (backslash !== -1) {
    const query = target.indexOf("?");
    if (query === -1 || backslash < query) throw new RequestError("Backslash in request path");
  }
};
var buildUrl = (scheme, host, incomingUrl) => {
  const url = `${scheme}://${host}${incomingUrl}`;
  if (!reValidHost.test(host)) {
    validateRequestTarget(incomingUrl);
    const urlObj = new URL(url);
    if (urlObj.hostname.length !== host.length && urlObj.hostname !== (host.includes(":") ? host.replace(/:\d+$/, "") : host).toLowerCase()) throw new RequestError("Invalid host header");
    return urlObj.href;
  } else if (incomingUrl.length === 0) return url + "/";
  else {
    if (incomingUrl.charCodeAt(0) !== 47) throw new RequestError("Invalid URL");
    if (!reValidRequestUrl.test(incomingUrl) || reDotSegment.test(incomingUrl)) {
      validateRequestTarget(incomingUrl);
      return new URL(url).href;
    }
    return url;
  }
};
var toRequestError = (e) => {
  if (e instanceof RequestError) return e;
  return new RequestError(e.message, { cause: e });
};
var GlobalRequest = global.Request;
var Request$1 = class Request$12 extends GlobalRequest {
  static [Symbol.hasInstance](instance) {
    if (this === Request$12) return instance instanceof GlobalRequest || Function.prototype[Symbol.hasInstance].call(this, instance);
    return Function.prototype[Symbol.hasInstance].call(this, instance);
  }
  constructor(input, options) {
    if (typeof input === "object" && getRequestCache in input) {
      const hasReplacementBody = options !== void 0 && "body" in options && options.body != null;
      if (input[bodyConsumedDirectlyKey] && !hasReplacementBody) throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
      input = input[getRequestCache]();
    }
    if (typeof options?.body?.getReader !== "undefined") options.duplex ??= "half";
    super(input, options);
  }
};
var wrapBodyStream = /* @__PURE__ */ Symbol("wrapBodyStream");
var byteExactEncodings = /* @__PURE__ */ new Set([
  "latin1",
  "binary",
  "hex",
  "base64",
  "base64url"
]);
var isByteExactEncoding = (encoding) => encoding === null || byteExactEncodings.has(encoding);
var bodyBufferedBeforeDisconnectKey = /* @__PURE__ */ Symbol("bodyBufferedBeforeDisconnect");
var bodyBufferedLengthBeforeDisconnectKey = /* @__PURE__ */ Symbol("bodyBufferedLengthBeforeDisconnect");
var toBufferChunk = (chunk, encoding) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding ?? "utf8");
var isRecoverableDisconnectedIncoming = (incoming) => !(incoming instanceof Http2ServerRequest) && !!incoming.complete && !!incoming.readableAborted && typeof incoming.read === "function" && isByteExactEncoding(incoming.readableEncoding);
var recordBodyBufferedBeforeDisconnect = (incoming) => {
  if (incoming.readableDidRead || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] ??= incoming.readableLength;
};
var readBodyBufferedBeforeDisconnect = (incoming, chunks) => {
  if (incoming.readableDidRead && !chunks || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  if (incomingWithRecovery[bodyBufferedBeforeDisconnectKey] !== void 0) return incomingWithRecovery[bodyBufferedBeforeDisconnectKey];
  let result;
  const errored = incoming.errored;
  if (errored && errored.code !== "ECONNRESET") result = errored;
  else if (incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] !== void 0 && incoming.readableLength !== incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey]) result = newBodyUnusableError();
  else {
    const bodyChunks = chunks ?? [];
    let chunk;
    while ((chunk = incoming.read()) !== null) bodyChunks.push(toBufferChunk(chunk, incoming.readableEncoding));
    const buffer = bodyChunks.length === 1 ? bodyChunks[0] : Buffer.concat(bodyChunks);
    result = buffer;
    const contentLength = incoming.headers["content-length"];
    if (typeof contentLength === "string" && /^\d+$/.test(contentLength)) {
      const expectedLength = Number(contentLength);
      if (Number.isSafeInteger(expectedLength) && buffer.length !== expectedLength) result = newBodyUnusableError();
    }
  }
  incomingWithRecovery[bodyBufferedBeforeDisconnectKey] = result;
  return result;
};
var enqueueBufferedBody = (controller, buffered) => {
  if (buffered instanceof Error) {
    controller.error(buffered);
    return;
  }
  if (buffered.length > 0) controller.enqueue(buffered);
  controller.close();
};
var newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
  const init = {
    method,
    headers,
    signal: abortController.signal
  };
  if (method === "TRACE") {
    init.method = "GET";
    const req = new Request$1(url, init);
    Object.defineProperty(req, "method", { get() {
      return "TRACE";
    } });
    return req;
  }
  if (!(method === "GET" || method === "HEAD")) if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) init.body = new ReadableStream({ start(controller) {
    controller.enqueue(incoming.rawBody);
    controller.close();
  } });
  else if (incoming[wrapBodyStream]) {
    let reader;
    init.body = new ReadableStream({ async pull(controller) {
      try {
        if (!reader) {
          const buffered = readBodyBufferedBeforeDisconnect(incoming);
          if (buffered !== void 0) {
            enqueueBufferedBody(controller, buffered);
            return;
          }
        }
        reader ||= Readable.toWeb(incoming).getReader();
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    } });
  } else {
    const buffered = readBodyBufferedBeforeDisconnect(incoming);
    if (buffered !== void 0) init.body = new ReadableStream({ start(controller) {
      enqueueBufferedBody(controller, buffered);
    } });
    else init.body = Readable.toWeb(incoming);
  }
  return new Request$1(url, init);
};
var getRequestCache = /* @__PURE__ */ Symbol("getRequestCache");
var requestCache = /* @__PURE__ */ Symbol("requestCache");
var incomingKey = /* @__PURE__ */ Symbol("incomingKey");
var urlKey = /* @__PURE__ */ Symbol("urlKey");
var methodKey = /* @__PURE__ */ Symbol("methodKey");
var headersKey = /* @__PURE__ */ Symbol("headersKey");
var abortControllerKey = /* @__PURE__ */ Symbol("abortControllerKey");
var getAbortController = /* @__PURE__ */ Symbol("getAbortController");
var abortRequest = /* @__PURE__ */ Symbol("abortRequest");
var bodyBufferKey = /* @__PURE__ */ Symbol("bodyBuffer");
var bodyReadPromiseKey = /* @__PURE__ */ Symbol("bodyReadPromise");
var bodyConsumedDirectlyKey = /* @__PURE__ */ Symbol("bodyConsumedDirectly");
var bodyLockReaderKey = /* @__PURE__ */ Symbol("bodyLockReader");
var abortReasonKey = /* @__PURE__ */ Symbol("abortReason");
var newBodyUnusableError = () => {
  return /* @__PURE__ */ new TypeError("Body is unusable");
};
var rejectBodyUnusable = () => {
  return Promise.reject(newBodyUnusableError());
};
var textDecoder = new TextDecoder();
var consumeBodyDirectOnce = (request) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  request[bodyConsumedDirectlyKey] = true;
};
var toArrayBuffer = (buf) => {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
var contentType = (request) => {
  return (request[headersKey] ||= newHeadersFromIncoming(request[incomingKey])).get("content-type") || "";
};
var methodTokenRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var normalizeIncomingMethod = (method) => {
  if (typeof method !== "string" || method.length === 0) return "GET";
  switch (method) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "PATCH":
    case "POST":
    case "PUT":
    case "QUERY":
      return method;
  }
  const upper = method.toUpperCase();
  switch (upper) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "POST":
    case "PUT":
      return upper;
    default:
      return method;
  }
};
var validateDirectReadMethod = (method) => {
  if (!methodTokenRegExp.test(method)) return /* @__PURE__ */ new TypeError(`'${method}' is not a valid HTTP method.`);
  const normalized = method.toUpperCase();
  if (normalized === "CONNECT" || normalized === "TRACK" || normalized === "TRACE" && method !== "TRACE") return /* @__PURE__ */ new TypeError(`'${method}' HTTP method is unsupported.`);
};
var readBodyWithFastPath = (request, method, fromBuffer) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  const methodName = request.method;
  if (methodName === "GET" || methodName === "HEAD") return request[getRequestCache]()[method]();
  const methodValidationError = validateDirectReadMethod(methodName);
  if (methodValidationError) return Promise.reject(methodValidationError);
  if (request[requestCache]) {
    if (methodName !== "TRACE") return request[requestCache][method]();
  }
  const alreadyUsedError = consumeBodyDirectOnce(request);
  if (alreadyUsedError) return alreadyUsedError;
  const raw2 = readRawBodyIfAvailable(request);
  if (raw2) {
    const result = Promise.resolve(fromBuffer(raw2, request));
    request[bodyBufferKey] = void 0;
    return result;
  }
  return readBodyDirect(request).then((buf) => {
    const result = fromBuffer(buf, request);
    request[bodyBufferKey] = void 0;
    return result;
  });
};
var readRawBodyIfAvailable = (request) => {
  const incoming = request[incomingKey];
  if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) return incoming.rawBody;
};
var normalizeAbortError = (request, incoming) => {
  if (incoming.errored) return incoming.errored;
  const reason = request[abortReasonKey];
  if (reason !== void 0) return reason instanceof Error ? reason : new Error(String(reason));
  return /* @__PURE__ */ new Error("Client connection prematurely closed.");
};
var readBodyDirect = (request) => {
  if (request[bodyBufferKey]) return Promise.resolve(request[bodyBufferKey]);
  if (request[bodyReadPromiseKey]) return request[bodyReadPromiseKey];
  const incoming = request[incomingKey];
  if (incoming.readableDidRead) return rejectBodyUnusable();
  const buffered = readBodyBufferedBeforeDisconnect(incoming);
  if (buffered !== void 0) {
    if (buffered instanceof Error) return Promise.reject(buffered);
    request[bodyBufferKey] = buffered;
    return Promise.resolve(buffered);
  }
  const promise = new Promise((resolve3, reject) => {
    const chunks = [];
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const recoverCompleteBodyAfterDisconnect = (error) => {
      const streamError = incoming.errored ?? error;
      if (!isRecoverableDisconnectedIncoming(incoming) || streamError && streamError.code !== "ECONNRESET") return false;
      finish(() => {
        const recovered = readBodyBufferedBeforeDisconnect(incoming, chunks);
        if (recovered instanceof Error) reject(recovered);
        else if (recovered === void 0) reject(error ?? normalizeAbortError(request, incoming));
        else {
          request[bodyBufferKey] = recovered;
          resolve3(recovered);
        }
      });
      return true;
    };
    const onData = (chunk) => {
      chunks.push(toBufferChunk(chunk, incoming.readableEncoding));
    };
    const onEnd = () => {
      finish(() => {
        const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
        request[bodyBufferKey] = buffer;
        resolve3(buffer);
      });
    };
    const onError = (error) => {
      if (recoverCompleteBodyAfterDisconnect(error)) return;
      finish(() => {
        reject(error);
      });
    };
    const onClose = () => {
      if (incoming.readableEnded) {
        onEnd();
        return;
      }
      if (recoverCompleteBodyAfterDisconnect()) return;
      finish(() => {
        reject(normalizeAbortError(request, incoming));
      });
    };
    const cleanup = () => {
      incoming.off("data", onData);
      incoming.off("end", onEnd);
      incoming.off("error", onError);
      incoming.off("close", onClose);
      request[bodyReadPromiseKey] = void 0;
    };
    incoming.on("data", onData);
    incoming.on("end", onEnd);
    incoming.on("error", onError);
    incoming.on("close", onClose);
    queueMicrotask(() => {
      if (settled) return;
      if (incoming.readableEnded) onEnd();
      else if (incoming.errored) onError(incoming.errored);
      else if (incoming.destroyed) onClose();
    });
  });
  request[bodyReadPromiseKey] = promise;
  return promise;
};
var requestPrototype = {
  get method() {
    return this[methodKey];
  },
  get url() {
    return this[urlKey];
  },
  get headers() {
    return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
  },
  [abortRequest](reason) {
    if (this[abortReasonKey] === void 0) this[abortReasonKey] = reason;
    const abortController = this[abortControllerKey];
    if (abortController && !abortController.signal.aborted) abortController.abort(reason);
  },
  [getAbortController]() {
    this[abortControllerKey] ||= new AbortController();
    if (this[abortReasonKey] !== void 0 && !this[abortControllerKey].signal.aborted) this[abortControllerKey].abort(this[abortReasonKey]);
    return this[abortControllerKey];
  },
  [getRequestCache]() {
    const abortController = this[getAbortController]();
    if (this[requestCache]) return this[requestCache];
    const method = this.method;
    if (this[bodyConsumedDirectlyKey] && !(method === "GET" || method === "HEAD")) {
      this[bodyBufferKey] = void 0;
      const init = {
        method: method === "TRACE" ? "GET" : method,
        headers: this.headers,
        signal: abortController.signal
      };
      if (method !== "TRACE") {
        init.body = new ReadableStream({ start(c) {
          c.close();
        } });
        init.duplex = "half";
      }
      const req = new Request$1(this[urlKey], init);
      if (method === "TRACE") Object.defineProperty(req, "method", { get() {
        return "TRACE";
      } });
      return this[requestCache] = req;
    }
    return this[requestCache] = newRequestFromIncoming(this.method, this[urlKey], this.headers, this[incomingKey], abortController);
  },
  get body() {
    if (!this[bodyConsumedDirectlyKey]) return this[getRequestCache]().body;
    const request = this[getRequestCache]();
    if (!this[bodyLockReaderKey] && request.body) this[bodyLockReaderKey] = request.body.getReader();
    return request.body;
  },
  get bodyUsed() {
    if (this[bodyConsumedDirectlyKey]) return true;
    if (this[requestCache]) return this[requestCache].bodyUsed;
    return false;
  }
};
Object.defineProperty(requestPrototype, "signal", { get() {
  return this[getAbortController]().signal;
} });
[
  "cache",
  "credentials",
  "destination",
  "duplex",
  "integrity",
  "mode",
  "redirect",
  "referrer",
  "referrerPolicy",
  "keepalive"
].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { get() {
    return this[getRequestCache]()[k];
  } });
});
["clone", "formData"].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { value: function() {
    if (this[bodyConsumedDirectlyKey]) {
      if (k === "clone") throw newBodyUnusableError();
      return rejectBodyUnusable();
    }
    return this[getRequestCache]()[k]();
  } });
});
Object.defineProperty(requestPrototype, "text", { value: function() {
  return readBodyWithFastPath(this, "text", (buf) => textDecoder.decode(buf));
} });
Object.defineProperty(requestPrototype, "arrayBuffer", { value: function() {
  return readBodyWithFastPath(this, "arrayBuffer", (buf) => toArrayBuffer(buf));
} });
Object.defineProperty(requestPrototype, "blob", { value: function() {
  return readBodyWithFastPath(this, "blob", (buf, request) => {
    const type = contentType(request);
    const init = type ? { headers: { "content-type": type } } : void 0;
    return new Response(buf, init).blob();
  });
} });
Object.defineProperty(requestPrototype, "bytes", { value: function() {
  return this.arrayBuffer().then((buf) => new Uint8Array(buf));
} });
Object.defineProperty(requestPrototype, "json", { value: function() {
  if (this[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  return this.text().then(JSON.parse);
} });
Object.defineProperty(requestPrototype, /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Request (lightweight) ${inspectFn({
    method: this.method,
    url: this.url,
    headers: this.headers,
    nativeRequest: this[requestCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(requestPrototype, Request$1.prototype);
var newRequest = (incoming, defaultHostname) => {
  const req = Object.create(requestPrototype);
  req[incomingKey] = incoming;
  req[methodKey] = normalizeIncomingMethod(incoming.method);
  const incomingUrl = incoming.url || "";
  if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
    if (incoming instanceof Http2ServerRequest) throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
    try {
      validateRequestTarget(incomingUrl);
      req[urlKey] = new URL(incomingUrl).href;
    } catch (e) {
      throw new RequestError("Invalid absolute URL", { cause: e });
    }
    return req;
  }
  const host = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
  if (!host) throw new RequestError("Missing host header");
  let scheme;
  if (incoming instanceof Http2ServerRequest) {
    scheme = incoming.scheme;
    if (!(scheme === "http" || scheme === "https")) throw new RequestError("Unsupported scheme");
  } else scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
  try {
    req[urlKey] = buildUrl(scheme, host, incomingUrl);
  } catch (e) {
    if (e instanceof RequestError) throw e;
    else throw new RequestError("Invalid URL", { cause: e });
  }
  return req;
};
var defaultContentType = "text/plain; charset=UTF-8";
var responseCache = /* @__PURE__ */ Symbol("responseCache");
var getResponseCache = /* @__PURE__ */ Symbol("getResponseCache");
var cacheKey = /* @__PURE__ */ Symbol("cache");
var GlobalResponse = global.Response;
var Response$1 = class Response$12 {
  #body;
  #init;
  static [Symbol.hasInstance](instance) {
    if (this === Response$12) return instance instanceof GlobalResponse || Function.prototype[Symbol.hasInstance].call(this, instance);
    return Function.prototype[Symbol.hasInstance].call(this, instance);
  }
  [getResponseCache]() {
    const cache = this[cacheKey];
    const liveHeaders = cache && cache[2] instanceof Headers ? cache[2] : void 0;
    delete this[cacheKey];
    return this[responseCache] ||= new GlobalResponse(this.#body, liveHeaders ? {
      status: this.#init?.status,
      statusText: this.#init?.statusText,
      headers: liveHeaders
    } : this.#init);
  }
  constructor(body, init) {
    let headers;
    this.#body = body;
    if (init instanceof GlobalResponse) {
      const cachedGlobalResponse = init[responseCache];
      if (cachedGlobalResponse) {
        this.#init = cachedGlobalResponse;
        this[getResponseCache]();
        return;
      }
      this.#init = #init in init ? init.#init : init;
      headers = new Headers(init.headers);
    } else this.#init = init;
    if (body == null || typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) this[cacheKey] = [
      init?.status || 200,
      body ?? null,
      headers || init?.headers
    ];
  }
  get headers() {
    const cache = this[cacheKey];
    if (cache) {
      if (!(cache[2] instanceof Headers)) cache[2] = new Headers(cache[2] || (cache[1] === null ? void 0 : { "content-type": defaultContentType }));
      return cache[2];
    }
    return this[getResponseCache]().headers;
  }
  get status() {
    return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
  }
  get ok() {
    const status = this.status;
    return status >= 200 && status < 300;
  }
};
[
  "body",
  "bodyUsed",
  "redirected",
  "statusText",
  "trailers",
  "type",
  "url"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { get() {
    return this[getResponseCache]()[k];
  } });
});
[
  "arrayBuffer",
  "blob",
  "bytes",
  "clone",
  "formData",
  "json",
  "text"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { value: function() {
    return this[getResponseCache]()[k]();
  } });
});
Object.defineProperty(Response$1.prototype, /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Response (lightweight) ${inspectFn({
    status: this.status,
    headers: this.headers,
    ok: this.ok,
    nativeResponse: this[responseCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(Response$1, GlobalResponse);
Object.setPrototypeOf(Response$1.prototype, GlobalResponse.prototype);
var validRedirectUrl = /^https?:\/\/[!#-;=?-[\]_a-z~A-Z]+$/;
var parseRedirectUrl = (url) => {
  if (url instanceof URL) return url.href;
  if (validRedirectUrl.test(url)) return url;
  return new URL(url).href;
};
var validRedirectStatuses = /* @__PURE__ */ new Set([
  301,
  302,
  303,
  307,
  308
]);
Object.defineProperty(Response$1, "redirect", {
  value: function redirect(url, status = 302) {
    if (!validRedirectStatuses.has(status)) throw new RangeError("Invalid status code");
    return new Response$1(null, {
      status,
      headers: { location: parseRedirectUrl(url) }
    });
  },
  writable: true,
  configurable: true
});
Object.defineProperty(Response$1, "json", {
  value: function json(data, init) {
    const body = JSON.stringify(data);
    if (body === void 0) throw new TypeError("The data is not JSON serializable");
    const initHeaders = init?.headers;
    let headers;
    if (initHeaders) {
      headers = new Headers(initHeaders);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    } else headers = { "content-type": "application/json" };
    return new Response$1(body, {
      status: init?.status ?? 200,
      statusText: init?.statusText,
      headers
    });
  },
  writable: true,
  configurable: true
});
async function readWithoutBlocking(readPromise) {
  return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
  const cancel = (error) => {
    reader.cancel(error).catch(() => {
    });
  };
  const stream2 = writable.stream;
  if (writable.destroyed || stream2?.closed || stream2?.destroyed) {
    cancel();
    return reader.closed;
  }
  writable.on("close", cancel);
  writable.on("error", cancel);
  (currentReadPromise ?? reader.read()).then(flow, handleStreamError);
  return reader.closed.finally(() => {
    writable.off("close", cancel);
    writable.off("error", cancel);
  });
  function handleStreamError(error) {
    if (error) writable.destroy(error);
  }
  function onDrain() {
    reader.read().then(flow, handleStreamError);
  }
  function flow({ done, value }) {
    try {
      if (done) writable.end();
      else if (!writable.write(value)) writable.once("drain", onDrain);
      else reader.read().then(flow, handleStreamError);
    } catch (e) {
      handleStreamError(e);
    }
  }
}
function writeFromReadableStream(stream2, writable) {
  if (stream2.locked) throw new TypeError("ReadableStream is locked.");
  else if (writable.destroyed) {
    stream2.cancel().catch(() => {
    });
    return;
  }
  return writeFromReadableStreamDefaultReader(stream2.getReader(), writable);
}
var buildOutgoingHttpHeaders = (headers, defaultContentType2) => {
  const res = {};
  if (!(headers instanceof Headers)) headers = new Headers(headers ?? void 0);
  if (headers.has("set-cookie")) {
    const cookies = [];
    for (const [k, v] of headers) if (k === "set-cookie") cookies.push(v);
    else res[k] = v;
    if (cookies.length > 0) res["set-cookie"] = cookies;
  } else for (const [k, v] of headers) res[k] = v;
  if (defaultContentType2) res["content-type"] ??= defaultContentType2;
  return res;
};
var outgoingEnded = /* @__PURE__ */ Symbol("outgoingEnded");
var incomingDraining = /* @__PURE__ */ Symbol("incomingDraining");
var DRAIN_TIMEOUT_MS = 500;
var MAX_DRAIN_BYTES = 64 * 1024 * 1024;
var drainIncoming = (incoming) => {
  const incomingWithDrainState = incoming;
  if (incoming.destroyed || incomingWithDrainState[incomingDraining]) return;
  incomingWithDrainState[incomingDraining] = true;
  if (incoming instanceof Http2ServerRequest) {
    try {
      incoming.stream?.close?.(constants.NGHTTP2_NO_ERROR);
    } catch {
    }
    return;
  }
  let bytesRead = 0;
  const cleanup = () => {
    clearTimeout(timer);
    incoming.off("data", onData);
    incoming.off("end", cleanup);
    incoming.off("error", cleanup);
  };
  const forceClose = () => {
    cleanup();
    const socket = incoming.socket;
    if (socket && !socket.destroyed) {
      if (typeof socket.destroySoon === "function") socket.destroySoon();
      else if (typeof socket.destroy === "function") socket.destroy();
    }
  };
  const timer = setTimeout(forceClose, DRAIN_TIMEOUT_MS);
  timer.unref?.();
  const onData = (chunk) => {
    bytesRead += chunk.length;
    if (bytesRead > MAX_DRAIN_BYTES) forceClose();
  };
  incoming.on("data", onData);
  incoming.on("end", cleanup);
  incoming.on("error", cleanup);
  incoming.resume();
};
var makeCloseHandler = (req, incoming, outgoing, needsBodyCleanup) => () => {
  if (incoming.errored) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest](incoming.errored.toString());
  } else if (!outgoing.writableFinished || incoming instanceof Http2ServerRequest && incoming.aborted) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest]("Client connection prematurely closed.");
  }
  if (needsBodyCleanup && !incoming.readableEnded) setTimeout(() => {
    if (!incoming.readableEnded) setTimeout(() => {
      drainIncoming(incoming);
    });
  });
};
var isImmediateCacheableResponse = (res) => {
  if (!(cacheKey in res)) return false;
  const body = res[cacheKey][1];
  return body === null || typeof body === "string" || body instanceof Uint8Array;
};
var handleRequestError = () => new Response(null, { status: 400 });
var handleFetchError = (e) => new Response(null, { status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500 });
var handleResponseError = (e, outgoing) => {
  const err = e instanceof Error ? e : new Error("unknown error", { cause: e });
  if (err.code === "ERR_STREAM_PREMATURE_CLOSE") console.info("The user aborted a request.");
  else {
    console.error(e);
    if (!outgoing.headersSent) {
      if (outgoing instanceof ServerResponse) outgoing._contentLength = null;
      outgoing.writeHead(500, { "Content-Type": "text/plain" });
    }
    outgoing.end(`Error: ${err.message}`);
    outgoing.destroy(err);
  }
};
var flushHeaders = (outgoing) => {
  if ("flushHeaders" in outgoing && outgoing.writable) outgoing.flushHeaders();
};
var trySetContentLength = (outgoing, status, length) => {
  const http1 = outgoing;
  if (http1._contentLength === null && http1._hasBody && http1.useChunkedEncodingByDefault && !http1._removedContLen && status >= 200 && status !== 204 && status !== 304 && !outgoing.hasHeader("content-length") && !outgoing.hasHeader("transfer-encoding") && !outgoing.hasHeader("trailer")) {
    http1._contentLength = length;
    return true;
  }
  return false;
};
var writeDefaultHeaders = (outgoing, status, length) => {
  if (trySetContentLength(outgoing, status, length)) outgoing.writeHead(status, { "Content-Type": defaultContentType });
  else outgoing.writeHead(status, {
    "Content-Type": defaultContentType,
    "Content-Length": length
  });
};
var responseViaCache = async (res, outgoing) => {
  let [status, body, header] = res[cacheKey];
  if (!header) {
    if (body === null) {
      outgoing.writeHead(status);
      outgoing.end();
    } else if (typeof body === "string") {
      writeDefaultHeaders(outgoing, status, Buffer.byteLength(body));
      outgoing.end(body);
    } else if (body instanceof Uint8Array) {
      writeDefaultHeaders(outgoing, status, body.byteLength);
      outgoing.end(body);
    } else if (body instanceof Blob) {
      writeDefaultHeaders(outgoing, status, body.size);
      outgoing.end(new Uint8Array(await body.arrayBuffer()));
    } else {
      outgoing.writeHead(status, { "Content-Type": defaultContentType });
      flushHeaders(outgoing);
      await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
    }
    outgoing[outgoingEnded]?.();
    return;
  }
  let hasContentLength = false;
  let plainHeaders = false;
  let canAutoLength = true;
  if (header instanceof Headers) {
    hasContentLength = header.has("content-length");
    header = buildOutgoingHttpHeaders(header, body === null ? void 0 : defaultContentType);
  } else if (Array.isArray(header)) {
    const headerObj = new Headers(header);
    hasContentLength = headerObj.has("content-length");
    header = buildOutgoingHttpHeaders(headerObj, body === null ? void 0 : defaultContentType);
  } else {
    plainHeaders = true;
    for (const key in header) {
      if (key.length === 14 && key.toLowerCase() === "content-length") {
        hasContentLength = true;
        break;
      }
      if (key.length === 17 && key.toLowerCase() === "transfer-encoding" || key.length === 7 && key.toLowerCase() === "trailer") canAutoLength = false;
    }
  }
  if (!hasContentLength) {
    let length;
    if (typeof body === "string") length = Buffer.byteLength(body);
    else if (body instanceof Uint8Array) length = body.byteLength;
    else if (body instanceof Blob) length = body.size;
    if (length !== void 0 && (!plainHeaders || !canAutoLength || !trySetContentLength(outgoing, status, length))) {
      if (plainHeaders) header = { ...header };
      header["Content-Length"] = length;
    }
  }
  outgoing.writeHead(status, header);
  if (body == null) outgoing.end();
  else if (typeof body === "string" || body instanceof Uint8Array) outgoing.end(body);
  else if (body instanceof Blob) outgoing.end(new Uint8Array(await body.arrayBuffer()));
  else {
    flushHeaders(outgoing);
    await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
  }
  outgoing[outgoingEnded]?.();
};
var isPromise = (res) => typeof res.then === "function";
var responseViaResponseObject = async (res, outgoing, options = {}) => {
  if (isPromise(res)) if (options.errorHandler) try {
    res = await res;
  } catch (err) {
    const errRes = await options.errorHandler(err);
    if (!errRes) return;
    res = errRes;
  }
  else res = await res.catch(handleFetchError);
  if (cacheKey in res) return responseViaCache(res, outgoing);
  const resHeaderRecord = buildOutgoingHttpHeaders(res.headers, res.body === null ? void 0 : defaultContentType);
  if (res.body) {
    const reader = res.body.getReader();
    const values = [];
    let done = false;
    let currentReadPromise = void 0;
    if (resHeaderRecord["transfer-encoding"] !== "chunked") {
      let maxReadCount = 2;
      for (let i = 0; i < maxReadCount; i++) {
        currentReadPromise ||= reader.read();
        const chunk = await readWithoutBlocking(currentReadPromise);
        if (!chunk) {
          if (i === 1) {
            await new Promise((resolve3) => setTimeout(resolve3));
            maxReadCount = 3;
            continue;
          }
          break;
        }
        currentReadPromise = void 0;
        if (chunk.value) values.push(chunk.value);
        if (chunk.done) {
          done = true;
          break;
        }
      }
      if (done && !("content-length" in resHeaderRecord)) resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
    }
    outgoing.writeHead(res.status, resHeaderRecord);
    values.forEach((value) => {
      outgoing.write(value);
    });
    if (done) outgoing.end();
    else {
      if (values.length === 0) flushHeaders(outgoing);
      await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
    }
  } else if (resHeaderRecord[X_ALREADY_SENT]) {
  } else {
    outgoing.writeHead(res.status, resHeaderRecord);
    outgoing.end();
  }
  outgoing[outgoingEnded]?.();
};
var getRequestListener = (fetchCallback, options = {}) => {
  const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
  if (options.overrideGlobalObjects !== false && global.Request !== Request$1) {
    Object.defineProperty(global, "Request", { value: Request$1 });
    Object.defineProperty(global, "Response", { value: Response$1 });
  }
  return async (incoming, outgoing) => {
    let res, req;
    let needsBodyCleanup = false;
    let closeHandlerAttached = false;
    const ensureCloseHandler = () => {
      if (!req || closeHandlerAttached) return;
      closeHandlerAttached = true;
      outgoing.on("close", makeCloseHandler(req, incoming, outgoing, needsBodyCleanup));
    };
    try {
      req = newRequest(incoming, options.hostname);
      needsBodyCleanup = autoCleanupIncoming && !(incoming.method === "GET" || incoming.method === "HEAD");
      if (needsBodyCleanup) {
        incoming[wrapBodyStream] = true;
        if (incoming instanceof Http2ServerRequest) outgoing[outgoingEnded] = () => {
          if (!incoming.readableEnded) setTimeout(() => {
            if (!incoming.readableEnded) setTimeout(() => {
              incoming.destroy();
              outgoing.destroy();
            });
          });
        };
      }
      res = fetchCallback(req, {
        incoming,
        outgoing
      });
      if (!isPromise(res) && isImmediateCacheableResponse(res)) {
        if (needsBodyCleanup && !incoming.readableEnded) outgoing.once("finish", () => {
          if (!incoming.readableEnded) drainIncoming(incoming);
        });
        return responseViaCache(res, outgoing);
      }
      ensureCloseHandler();
    } catch (e) {
      if (!res) if (options.errorHandler) {
        ensureCloseHandler();
        res = await options.errorHandler(req ? e : toRequestError(e));
        if (!res) return;
      } else if (!req) res = handleRequestError();
      else res = handleFetchError(e);
      else return handleResponseError(e, outgoing);
    }
    try {
      return await responseViaResponseObject(res, outgoing, options);
    } catch (e) {
      return handleResponseError(e, outgoing);
    }
  };
};
var CloseEvent = globalThis.CloseEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get wasClean() {
    return this.#eventInitDict.wasClean ?? false;
  }
  get code() {
    return this.#eventInitDict.code ?? 0;
  }
  get reason() {
    return this.#eventInitDict.reason ?? "";
  }
};
var ErrorEvent = globalThis.ErrorEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get message() {
    return this.#eventInitDict.message ?? "";
  }
  get filename() {
    return this.#eventInitDict.filename ?? "";
  }
  get lineno() {
    return this.#eventInitDict.lineno ?? 0;
  }
  get colno() {
    return this.#eventInitDict.colno ?? 0;
  }
  get error() {
    return this.#eventInitDict.error ?? null;
  }
};
var generateConnectionSymbol = () => /* @__PURE__ */ Symbol("connection");
var CONNECTION_SYMBOL_KEY = /* @__PURE__ */ Symbol("CONNECTION_SYMBOL_KEY");
var WAIT_FOR_WEBSOCKET_SYMBOL = /* @__PURE__ */ Symbol("WAIT_FOR_WEBSOCKET_SYMBOL");
var responseHeadersToSkip = /* @__PURE__ */ new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "sec-websocket-accept",
  "sec-websocket-extensions",
  "sec-websocket-protocol"
]);
var appendResponseHeaders = (headers, responseHeaders) => {
  if (!responseHeaders) return;
  responseHeaders.forEach((value, key) => {
    if (responseHeadersToSkip.has(key.toLowerCase())) return;
    headers.push(`${key}: ${value}`);
  });
};
var rejectUpgradeRequest = (socket, status, responseHeaders) => {
  if (socket.destroyed) return;
  const responseLines = ["Connection: close", "Content-Length: 0"];
  appendResponseHeaders(responseLines, responseHeaders);
  socket.end(`HTTP/1.1 ${status.toString()} ${STATUS_CODES[status] ?? ""}\r
${responseLines.join("\r\n")}\r
\r
`);
};
var createUpgradeRequest = (request) => {
  const protocol = request.socket.encrypted ? "https" : "http";
  const incomingUrl = request.url ?? "/";
  let url;
  if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
    validateRequestTarget(incomingUrl);
    url = new URL(incomingUrl).href;
  } else url = buildUrl(protocol, request.headers.host ?? "localhost", incomingUrl);
  const headers = new Headers();
  for (const key in request.headers) {
    const value = request.headers[key];
    if (!value) continue;
    headers.append(key, Array.isArray(value) ? value[0] : value);
  }
  return new Request(url, { headers });
};
var setupWebSocket = (options) => {
  const { server, fetchCallback, wss } = options;
  const waiterMap = /* @__PURE__ */ new Map();
  wss.on("connection", (ws, request) => {
    const waiter = waiterMap.get(request);
    if (waiter) {
      waiter.resolve(ws);
      waiterMap.delete(request);
    }
  });
  const rejectWaiter = (request) => {
    const waiter = waiterMap.get(request);
    if (waiter) {
      waiterMap.delete(request);
      waiter.reject(/* @__PURE__ */ new Error("WebSocket handshake aborted"));
    }
  };
  const waitForWebSocket = (request, connectionSymbol) => {
    return new Promise((resolve3, reject) => {
      waiterMap.set(request, {
        resolve: resolve3,
        reject,
        connectionSymbol
      });
    });
  };
  server.on("upgrade", async (request, socket, head) => {
    const ignoreSocketError = () => {
    };
    socket.on("error", ignoreSocketError);
    if (request.headers.upgrade?.toLowerCase() !== "websocket") {
      if (server.listenerCount("upgrade") === 1) rejectUpgradeRequest(socket, 400);
      return;
    }
    const reclaimWaiterOnClose = () => rejectWaiter(request);
    socket.once("close", reclaimWaiterOnClose);
    const env = {
      incoming: request,
      outgoing: void 0,
      wss,
      [WAIT_FOR_WEBSOCKET_SYMBOL]: waitForWebSocket
    };
    let status = 400;
    let responseHeaders;
    try {
      const response = await fetchCallback(createUpgradeRequest(request), env);
      if (response instanceof Response) {
        status = response.status;
        responseHeaders = response.headers;
      }
    } catch (error) {
      if (server.listenerCount("upgrade") === 1) rejectUpgradeRequest(socket, error instanceof RequestError ? 400 : 500);
      return;
    }
    if (socket.destroyed) {
      rejectWaiter(request);
      return;
    }
    const waiter = waiterMap.get(request);
    if (!waiter || waiter.connectionSymbol !== env[CONNECTION_SYMBOL_KEY]) {
      rejectWaiter(request);
      if (server.listenerCount("upgrade") === 1) rejectUpgradeRequest(socket, status, responseHeaders);
      return;
    }
    const addResponseHeaders = (headers) => {
      appendResponseHeaders(headers, responseHeaders);
    };
    wss.on("headers", addResponseHeaders);
    try {
      wss.handleUpgrade(request, socket, head, (ws) => {
        socket.off("close", reclaimWaiterOnClose);
        socket.off("error", ignoreSocketError);
        wss.emit("connection", ws, request);
      });
    } finally {
      wss.off("headers", addResponseHeaders);
    }
  });
  server.on("close", () => {
    wss.close();
  });
};
var upgradeWebSocket = defineWebSocketHelper(async (c, events, options) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return;
  const env = c.env;
  const waitForWebSocket = env[WAIT_FOR_WEBSOCKET_SYMBOL];
  if (!waitForWebSocket || !env.incoming) return new Response(null, { status: 500 });
  const connectionSymbol = generateConnectionSymbol();
  env[CONNECTION_SYMBOL_KEY] = connectionSymbol;
  (async () => {
    let ws;
    try {
      ws = await waitForWebSocket(env.incoming, connectionSymbol);
    } catch {
      return;
    }
    const messagesReceivedInStarting = [];
    const bufferMessage = (data, isBinary) => {
      messagesReceivedInStarting.push([data, isBinary]);
    };
    ws.on("message", bufferMessage);
    const ctx = {
      binaryType: "arraybuffer",
      close(code, reason) {
        ws.close(code, reason);
      },
      protocol: ws.protocol,
      raw: ws,
      get readyState() {
        return ws.readyState;
      },
      send(source, opts) {
        ws.send(source, { compress: opts?.compress });
      },
      url: new URL(c.req.url)
    };
    try {
      events?.onOpen?.(new Event("open"), ctx);
    } catch (e) {
      (options?.onError ?? console.error)(e);
    }
    const handleMessage = (data, isBinary) => {
      const datas = Array.isArray(data) ? data : [data];
      for (const data2 of datas) try {
        events?.onMessage?.(new MessageEvent("message", { data: isBinary ? data2 instanceof ArrayBuffer ? data2 : data2.buffer.slice(data2.byteOffset, data2.byteOffset + data2.byteLength) : typeof data2 === "string" ? data2 : Buffer.from(data2).toString("utf-8") }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    };
    ws.off("message", bufferMessage);
    for (const message of messagesReceivedInStarting) handleMessage(...message);
    ws.on("message", (data, isBinary) => {
      handleMessage(data, isBinary);
    });
    ws.on("close", (code, reason) => {
      try {
        events?.onClose?.(new CloseEvent("close", {
          code,
          reason: reason.toString()
        }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
    ws.on("error", (error) => {
      try {
        events?.onError?.(new ErrorEvent("error", { error }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
  })();
  return new Response();
});
var createAdaptorServer = (options) => {
  const fetchCallback = options.fetch;
  const requestListener = getRequestListener(fetchCallback, {
    hostname: options.hostname,
    overrideGlobalObjects: options.overrideGlobalObjects,
    autoCleanupIncoming: options.autoCleanupIncoming
  });
  const server = (options.createServer || createServer)(options.serverOptions || {}, requestListener);
  if (options.websocket && options.websocket.server) {
    if (options.websocket.server.options.noServer !== true) throw new Error("WebSocket server must be created with { noServer: true } option");
    setupWebSocket({
      server,
      fetchCallback,
      wss: options.websocket.server
    });
  }
  return server;
};
var serve = (options, listeningListener) => {
  const server = createAdaptorServer(options);
  server.listen(options?.port ?? 3e3, options.hostname, () => {
    const serverInfo = server.address();
    listeningListener && listeningListener(serverInfo);
  });
  return server;
};

// src/shared/version.ts
var VERSION = true ? "0.1.3" : "0.0.0-dev";

// src/shared/outputs.ts
var MIME = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
  csv: "text/csv; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  ts: "text/plain; charset=utf-8",
  tsx: "text/plain; charset=utf-8",
  jsx: "text/plain; charset=utf-8",
  py: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  yml: "text/plain; charset=utf-8",
  xml: "application/xml",
  sh: "text/plain; charset=utf-8",
  toml: "text/plain; charset=utf-8",
  log: "text/plain; charset=utf-8"
};
var ext = (path) => {
  const base = path.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};
function mimeOf(path) {
  return MIME[ext(path)] ?? "application/octet-stream";
}
function outputKind(path) {
  const m = mimeOf(path);
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/html")) return "html";
  if (m.startsWith("text/markdown")) return "markdown";
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") return "text";
  return "other";
}

// src/server/config.ts
import { readFileSync, renameSync, writeFileSync } from "node:fs";

// src/shared/ignore.ts
var DEFAULT_IGNORED = ["runwell:*"];
function isIgnored(skillRef, patterns, marketplace = null) {
  return patterns.some((p) => p.startsWith("@") ? marketplace !== null && matches(marketplace, p.slice(1)) : matches(skillRef, p));
}
function matches(s, pattern) {
  const parts = pattern.split("*");
  if (parts.length === 1) return s === pattern;
  const first = parts[0];
  const last = parts.at(-1);
  if (!s.startsWith(first) || !s.endsWith(last) || s.length < first.length + last.length) return false;
  let pos = first.length;
  const stop = s.length - last.length;
  for (const mid of parts.slice(1, -1)) {
    const at = s.indexOf(mid, pos);
    if (at < 0 || at + mid.length > stop) return false;
    pos = at + mid.length;
  }
  return true;
}

// src/server/config.ts
var DEFAULT_CONFIG = {
  port: 4790,
  ignored: [...DEFAULT_IGNORED],
  claudePath: null,
  nodePath: null,
  claudeHome: null,
  maxRuns: 3,
  copyFileCapBytes: 200 * 1024 ** 2,
  copyRunCapBytes: 1024 ** 3,
  backfillDays: 90
};
var posInt = (v) => typeof v === "number" && Number.isInteger(v) && v > 0;
var strOrNull = (v) => v === null || typeof v === "string";
var CHECKS = {
  port: (v) => posInt(v) && v < 65536,
  ignored: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
  claudePath: strOrNull,
  nodePath: strOrNull,
  claudeHome: strOrNull,
  maxRuns: posInt,
  copyFileCapBytes: posInt,
  copyRunCapBytes: posInt,
  backfillDays: posInt
};
function readRaw(p) {
  try {
    const v = JSON.parse(readFileSync(p.configJson, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function loadConfig(p) {
  const raw2 = readRaw(p);
  const out = { ...DEFAULT_CONFIG, ignored: [...DEFAULT_CONFIG.ignored] };
  for (const key of Object.keys(CHECKS)) {
    if (key in raw2 && CHECKS[key](raw2[key])) out[key] = raw2[key];
  }
  return out;
}
function saveConfig(p, patch) {
  const merged = { ...readRaw(p), ...loadConfig(p), ...patch };
  const tmp = `${p.configJson}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2) + "\n", { mode: 384 });
  renameSync(tmp, p.configJson);
  return loadConfig(p);
}

// src/server/schema.ts
var SCHEMA_VERSION = 4;
var MIGRATIONS = {
  1: `
CREATE TABLE skills (
  key TEXT PRIMARY KEY, source TEXT NOT NULL, name TEXT NOT NULL, ref TEXT NOT NULL, description TEXT,
  path TEXT NOT NULL, plugin TEXT, project_path TEXT, warning TEXT, hash TEXT, has_workflow INTEGER DEFAULT 0,
  seen_at INTEGER, removed_at INTEGER
);
CREATE TABLE skill_versions (
  skill_key TEXT NOT NULL, n INTEGER NOT NULL, hash TEXT NOT NULL, first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (skill_key, n)
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY, skill_key TEXT NOT NULL, skill_ref TEXT NOT NULL, n INTEGER NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL, brief TEXT, cwd TEXT, place TEXT, project_path TEXT, model TEXT, allow_all INTEGER DEFAULT 0,
  skill_version INTEGER, pid INTEGER, created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER,
  waiting_ms INTEGER DEFAULT 0, rating INTEGER, note TEXT, source_ref TEXT, error TEXT
);
CREATE INDEX runs_skill_created ON runs (skill_key, created_at);
CREATE INDEX runs_status ON runs (status);
CREATE TABLE outputs (
  run_id TEXT NOT NULL, path TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, bytes INTEGER, mtime INTEGER,
  copied INTEGER DEFAULT 0, hash TEXT, PRIMARY KEY (run_id, path)
);
CREATE TABLE backfill_files (
  path TEXT PRIMARY KEY, size INTEGER, mtime INTEGER, done_at INTEGER, skipped_lines INTEGER DEFAULT 0
);
CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
`,
  // Claude's own session id for a run, so it can be continued with claude --resume.
  2: `ALTER TABLE runs ADD COLUMN session_id TEXT;`,
  // Which marketplace a plugin skill came from, so a whole marketplace can be ignored (@name).
  3: `ALTER TABLE skills ADD COLUMN marketplace TEXT;`,
  // How a button run was allowed to act: auto (Claude Code's Auto mode) or ask (the person's own settings).
  4: `ALTER TABLE runs ADD COLUMN mode TEXT;`
};

// src/server/db.ts
async function hasNodeSqlite() {
  try {
    const m = await import("node:sqlite");
    return typeof m.DatabaseSync === "function";
  } catch {
    return false;
  }
}
var plain = (row) => row && typeof row === "object" ? { ...row } : row;
function withTx(db) {
  let depth = 0;
  return {
    ...db,
    tx(fn) {
      if (depth > 0) return fn();
      db.exec("BEGIN");
      depth++;
      try {
        const out = fn();
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      } finally {
        depth--;
      }
    }
  };
}
async function openDbWith(backend, file) {
  if (backend === "node") {
    const { DatabaseSync } = await import("node:sqlite");
    const d2 = new DatabaseSync(file);
    d2.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
    return withTx({
      run: (sql, ...p) => void d2.prepare(sql).run(...p),
      get: (sql, ...p) => plain(d2.prepare(sql).get(...p)),
      all: (sql, ...p) => d2.prepare(sql).all(...p).map((r) => plain(r)),
      exec: (sql) => d2.exec(sql),
      close: () => d2.close()
    });
  }
  const { Database } = (await import("node-sqlite3-wasm")).default;
  const d = new Database(file);
  d.exec("PRAGMA busy_timeout = 3000;");
  return withTx({
    run: (sql, ...p) => void d.run(sql, p),
    get: (sql, ...p) => plain(d.get(sql, p) ?? void 0),
    all: (sql, ...p) => d.all(sql, p).map((r) => plain(r)),
    exec: (sql) => d.exec(sql),
    close: () => d.close()
  });
}
async function openDb(file) {
  return openDbWith(await hasNodeSqlite() ? "node" : "wasm", file);
}
function migrate(db) {
  const current = db.get("PRAGMA user_version")?.user_version ?? 0;
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    db.tx(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v}`);
    });
  }
}

// node_modules/hono/dist/http-exception.js
var HTTPException = class extends Error {
  res;
  status;
  /**
  * Creates an instance of `HTTPException`.
  * @param status - HTTP status code for the exception. Defaults to 500.
  * @param options - Additional options for the exception.
  */
  constructor(status = 500, options) {
    super(options?.message, { cause: options?.cause });
    this.res = options?.res;
    this.status = status;
  }
  /**
  * Returns the response object associated with the exception.
  * If a response object is not provided, a new response is created with the error message and status code.
  * @returns The response object.
  */
  getResponse() {
    if (this.res) return new Response(this.res.body, {
      status: this.status,
      headers: this.res.headers
    });
    return new Response(this.message, { status: this.status });
  }
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType2) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType2.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
};
var handleParsingNestedValues = (form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};
var throwNestingLimitExceeded = () => {
  throw new Error("Nesting limit exceeded");
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths2 = path.split("/");
  if (paths2[0] === "") paths2.shift();
  return paths2;
};
var splitRoutingPath = (routePath2) => {
  const { groups, path } = extractGroupsFromPath(routePath2);
  const paths2 = splitPath(path);
  return replaceGroupMarks(paths2, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
};
var replaceGroupMarks = (paths2, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths2.length - 1; j >= 0; j--) if (paths2[j].includes(mark)) {
      paths2[j] = paths2[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths2;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey2 = `${label}#${next}`;
    if (!patternCache[cacheKey2]) {
      if (match2[2]) patternCache[cacheKey2] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey2,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey2] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey2];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var decodeURIWithPreservedPercent = (value) => decodeURI(value.includes("%25") ? value.replace(/%25/g, "%2525") : value);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      const decoded = tryDecode(path, decodeURIWithPreservedPercent);
      if (/%(?![0-9A-Fa-f]{2})/.test(path)) {
        const rewritten = new URL("http://localhost");
        rewritten.pathname = decoded.replace(/[\\\t\n\r]/g, encodeURIComponent);
        if (tryDecode(rewritten.pathname, decodeURIWithPreservedPercent) !== decoded) return tryDecode(path.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"), decodeURIWithPreservedPercent);
      }
      return decoded;
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && !/[%+&=]/.test(key)) {
    const queryIndex = url.indexOf("?", 8);
    let keyIndex2 = queryIndex;
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61 || trailingKeyCode === 38 || isNaN(trailingKeyCode)) {
        if (keyIndex2 > queryIndex && /(?:^|&)[^=&]*[%+]/.test(url.slice(queryIndex + 1, keyIndex2))) break;
        if (trailingKeyCode === 61) {
          const valueIndex = keyIndex2 + key.length + 2;
          const endIndex = url.indexOf("&", valueIndex);
          return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
        }
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType2 = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType2 ? { "Content-Type": contentType2 } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  };
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) str = str.toString();
    if (str instanceof Promise) str = await str;
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) return Promise.resolve(str);
  if (buffer) buffer[0] += str;
  else buffer = [str];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType2, headers) => {
  return {
    "Content-Type": contentType2,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = (layout) => this.#layout = layout;
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = () => this.#layout;
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = (name, value, options) => {
    if (this.finalized && !this.#res.bodyUsed) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  };
  status = (status) => {
    this.#status = status;
  };
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  };
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = (object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  };
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler = i === middleware.length && next || void 0;
      if (handler) try {
        res = await handler(context, () => dispatch(i + 1));
      } catch (err) {
        if (err instanceof Error && onError) {
          context.error = err;
          res = await onError(err, context);
          isError = true;
        } else throw err;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
  };
};

// node_modules/hono/dist/helper/route/index.js
var matchedRoutes = (c) => c.req[GET_MATCH_RESULT][0].map(([[, route]]) => route);
var routePath = (c, index) => matchedRoutes(c).at(index ?? c.req.routeIndex)?.path ?? "";

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/utils/mount.js
var countTrailingSlashes = (path) => {
  let index = path.length;
  while (index > 0 && path.charCodeAt(index - 1) === 47) index--;
  return path.length - index;
};
var getPathPrefixLength = (c, pathPrefix, routePath2) => {
  if (!/[:*]/.test(pathPrefix)) return pathPrefix.length;
  const path = c.req.path;
  const matchResult = c.req[GET_MATCH_RESULT];
  const paramNames = /* @__PURE__ */ new Set();
  let length = 0;
  for (const part of splitRoutingPath(pathPrefix)) {
    if (part[0] === ":" && part.endsWith("}?")) throw new Error(`mount(): Optional regular expression parameters are not supported in "${routePath2}".`);
    const pattern = getPattern(part);
    if (pattern && pattern !== "*") {
      const name = pattern[1];
      if (paramNames.has(name)) throw new Error(`mount(): Duplicate path parameter "${name}" in "${routePath2}".`);
      paramNames.add(name);
    }
    if (pattern && pattern !== "*" && pattern[2] !== true) {
      const value = matchResult.length === 2 ? matchResult[1][matchResult[0][c.req.routeIndex][1][pattern[1]]] : matchResult[0][c.req.routeIndex][1][pattern[1]];
      length += value.length + 1;
    } else if (pattern || part.endsWith("*")) {
      const end = path.indexOf("/", length + 1);
      length = end === -1 ? path.length : end;
    } else length += part.length + 1;
  }
  return length;
};
var createMountedRequest = (c, pathPrefix, routePath2) => {
  if (/[^/]\*$/.test(routePath2)) throw new Error(`mount(): Wildcard must follow "/" in "${routePath2}".`);
  const prefixLength = getPathPrefixLength(c, pathPrefix, routePath2);
  const path = c.req.path.slice(prefixLength) || "/";
  if (prefixLength > c.req.path.length || path[0] !== "/" || /\/(?:\.|%2e){1,2}(?:\/|$)/i.test(path)) throw new HTTPException(400, { message: "Invalid mounted path" });
  const rawUrl = c.req.raw.url;
  if (/^[^/?#]*\/\/[^/?#\\]*[?#\\]/.test(rawUrl)) throw new HTTPException(400, { message: "Invalid mounted path" });
  const rawPathEnd = rawUrl.search(/[?#]/);
  const rawTrailingSlashes = countTrailingSlashes(rawPathEnd === -1 ? rawUrl : rawUrl.slice(0, rawPathEnd));
  if (rawTrailingSlashes > 1 && countTrailingSlashes(c.req.path) === rawTrailingSlashes - 1) throw new HTTPException(400, { message: "Invalid mounted path" });
  const url = new URL(rawUrl);
  url.pathname = path.replace(/[\\\t\n\r]/g, encodeURIComponent);
  if (path.includes("%")) {
  }
  return new Request(url, c.req.raw);
};

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class Hono2 {
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute("ALL", this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app) {
    const subApp = this.basePath(path);
    app.routes.map((r) => {
      let handler;
      if (app.errorHandler === errorHandler) handler = r.handler;
      else {
        handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  * @throws {Error} If automatic request rewriting encounters duplicate path parameter names or an optional regular expression parameter.
  * @throws {HTTPException} With status 400 if automatic request rewriting cannot safely preserve the routed path.
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = (request) => request;
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    const defaultReplaceRequest = (c) => {
      const mountedRoutePath = routePath(c);
      return createMountedRequest(c, mountedRoutePath.replace(/\/?\*$/, ""), mountedRoutePath);
    };
    const handler = async (c, next) => {
      const res = await applicationHandler(replaceRequest ? replaceRequest(c.req.raw) : defaultReplaceRequest(c), ...getOptions(c));
      if (res) return res;
      await next();
    };
    this.#addRoute("ALL", mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) return this.errorHandler(err, c);
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  };
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/utils.js
var createNullObject = () => /* @__PURE__ */ Object.create(null);

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = "[^]*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/[^]*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === "[^]*" || a === "(?:|/[^]*)") return b === "[^]*" ? -1 : 1;
  else if (b === "[^]*" || b === "(?:|/[^]*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class Node2 {
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, keys) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ONLY_WILDCARD_REG_EXP_STR
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (new RegExp(regexpStr).test("")) throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        keys.push(regexpStr);
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== "[^]*" && regexpStr !== "(?:|/[^]*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        keys.push(token);
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    const keys = [];
    if (isStatic) {
      this.#root.insert(path.split(""), -1, [], this.#context, keys);
      this.paths[path] = [
        -1,
        [],
        keys
      ];
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{(?:\{[\d,]+\}|[^}])+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./gs) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, keys);
    this.paths[path] = [
      this.#index++,
      paramAssoc,
      keys
    ];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
function endsWithWildcard(keys) {
  const tail = keys[keys.length - 1];
  return tail === "[^]*" || tail === "(?:|/[^]*)";
}
function covers(wildcard, target) {
  const last = wildcard.length - 1;
  for (let i = 0; i < last; i++) if (wildcard[i] !== target[i]) return false;
  return wildcard[last] === "[^]*" || target.length === last || target[last] === "/";
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #handlers;
  #tries;
  constructor() {
    this.#handlers = { ["ALL"]: [] };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const handlers = this.#handlers;
    if (!handlers) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    const tries = this.#tries;
    if (!handlers[method]) {
      tries[method] = new Trie();
      handlers[method] = [...handlers["ALL"]];
      for (const p in tries["ALL"].paths) this.#insertPath(method, p);
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(handlers) : [method];
    const paths2 = checkOptionalParameter(path) || [path];
    for (const path2 of paths2) for (const m of methods) {
      if (!tries[m].paths[path2]) this.#insertPath(m, path2);
      handlers[m].push([handler, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#handlers)) matchers[method] = this.#buildMatcher(method);
    this.#handlers = this.#tries = void 0;
    return matchers;
  }
  #buildMatcher(method) {
    const handlers = this.#handlers[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    const own = createNullObject();
    const entries = handlers.map(([h, p], i) => {
      (own[p] ??= []).push(i);
      return [h, trie.paths[p][1].reduceRight((map, [key, varIndex]) => {
        map[key] = paramReplacementMap[varIndex];
        return map;
      }, createNullObject())];
    });
    const wildcards = Object.keys(own).filter((p) => endsWithWildcard(trie.paths[p][2]));
    for (const path in trie.paths) {
      const [index, , keys] = trie.paths[path];
      const indexes = [...own[path]];
      for (const p of wildcards) if (p !== path && covers(trie.paths[p][2], keys)) indexes.push(...own[p]);
      const data = indexes.sort((a, b) => a - b).map((i) => entries[i]);
      if (index === -1) {
        const last = Math.max(-1, ...data.flatMap(([, map]) => Object.values(map)));
        staticMap[path] = [data, last === -1 ? emptyParam : path.match(regexp).slice(0, last + 1)];
      } else handlerData[index] = data;
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              if (!Object.hasOwn(params, name)) params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            if (!Object.hasOwn(params, name)) params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// node_modules/hono/dist/utils/stream.js
var StreamingApi = class {
  writer;
  encoder;
  writable;
  abortSubscribers = [];
  responseReadable;
  /**
  * Whether the stream has been aborted.
  */
  aborted = false;
  /**
  * Whether the stream has been closed normally.
  */
  closed = false;
  constructor(writable, _readable) {
    this.writable = writable;
    this.writer = writable.getWriter();
    this.encoder = new TextEncoder();
    const reader = _readable.getReader();
    this.abortSubscribers.push(async () => {
      await reader.cancel();
    });
    this.responseReadable = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        done ? controller.close() : controller.enqueue(value);
      },
      cancel: () => {
        if (!this.closed) this.abort();
      }
    });
  }
  async write(input) {
    try {
      if (typeof input === "string") input = this.encoder.encode(input);
      await this.writer.write(input);
    } catch {
    }
    return this;
  }
  async writeln(input) {
    await this.write(input + "\n");
    return this;
  }
  sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }
  async close() {
    this.closed = true;
    try {
      await this.writer.close();
    } catch {
    }
  }
  async pipe(body) {
    this.writer.releaseLock();
    try {
      await body.pipeTo(this.writable, {
        preventClose: true,
        preventAbort: true
      });
    } finally {
      this.writer = this.writable.getWriter();
    }
  }
  onAbort(listener) {
    this.abortSubscribers.push(listener);
  }
  /**
  * Abort the stream.
  * You can call this method when stream is aborted by external event.
  */
  abort() {
    if (!this.aborted) {
      this.aborted = true;
      this.abortSubscribers.forEach((subscriber) => {
        try {
          Promise.resolve(subscriber()).catch(() => {
          });
        } catch {
        }
      });
    }
  }
};

// node_modules/hono/dist/helper/streaming/utils.js
var isOldBunVersion = () => {
  const version = typeof Bun !== "undefined" ? Bun.version : void 0;
  if (version === void 0) return false;
  const result = version.startsWith("1.1") || version.startsWith("1.0") || version.startsWith("0.");
  isOldBunVersion = () => result;
  return result;
};

// node_modules/hono/dist/helper/streaming/sse.js
var SSEStreamingApi = class extends StreamingApi {
  constructor(writable, readable) {
    super(writable, readable);
  }
  async writeSSE(message) {
    const dataLines = (await resolveCallback(message.data, HtmlEscapedCallbackPhase.Stringify, false, {})).split(/\r\n|\r|\n/).map((line) => {
      return `data: ${line}`;
    }).join("\n");
    for (const key of ["event", "id"]) {
      const value = message[key];
      if (value && /[\r\n]/.test(value)) throw new Error(`${key} must not contain "\\r" or "\\n"`);
    }
    const sseData = [
      message.event && `event: ${message.event}`,
      dataLines,
      message.id !== void 0 && `id: ${message.id}`,
      message.retry !== void 0 && `retry: ${message.retry}`
    ].filter(Boolean).join("\n") + "\n\n";
    await this.write(sseData);
  }
};
var run = async (stream2, cb, onError) => {
  try {
    await cb(stream2);
  } catch (e) {
    if (e instanceof Error && onError) {
      await onError(e, stream2);
      await stream2.writeSSE({
        event: "error",
        data: e.message
      });
    } else console.error(e);
  } finally {
    stream2.close();
  }
};
var contextStash = /* @__PURE__ */ new WeakMap();
var streamSSE = (c, cb, onError) => {
  const { readable, writable } = new TransformStream();
  const stream2 = new SSEStreamingApi(writable, readable);
  if (isOldBunVersion()) c.req.raw.signal.addEventListener("abort", () => {
    if (!stream2.closed) stream2.abort();
  });
  contextStash.set(stream2.responseReadable, c);
  c.header("Transfer-Encoding", "chunked");
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  run(stream2, cb, onError);
  return c.newResponse(stream2.responseReadable);
};

// src/server/routes/auth.ts
import { randomBytes } from "node:crypto";

// node_modules/hono/dist/utils/cookie.js
var validCookieNameRegEx = /^[\w!#$%&'*.^`|~+-]+$/;
var relaxedCookieNameRegEx = /^[!#-:<>-[\]-~]+$/;
var validCookieValueRegEx = /^[ !#-:<-[\]-~]*$/;
var trimCookieWhitespace = (value) => {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const charCode = value.charCodeAt(start);
    if (charCode !== 32 && charCode !== 9) break;
    start++;
  }
  while (end > start) {
    const charCode = value.charCodeAt(end - 1);
    if (charCode !== 32 && charCode !== 9) break;
    end--;
  }
  return start === 0 && end === value.length ? value : value.slice(start, end);
};
var parse = (cookie, name) => {
  if (name && cookie.indexOf(name) === -1) return {};
  const pairs = cookie.split(";");
  const parsedCookie = /* @__PURE__ */ Object.create(null);
  for (const pairStr of pairs) {
    const valueStartPos = pairStr.indexOf("=");
    if (valueStartPos === -1) continue;
    const cookieName = trimCookieWhitespace(pairStr.substring(0, valueStartPos));
    if (name && name !== cookieName || !relaxedCookieNameRegEx.test(cookieName) || cookieName in parsedCookie) continue;
    let cookieValue = trimCookieWhitespace(pairStr.substring(valueStartPos + 1));
    if (cookieValue.length >= 2 && cookieValue.startsWith('"') && cookieValue.endsWith('"')) cookieValue = cookieValue.slice(1, -1);
    if (validCookieValueRegEx.test(cookieValue)) {
      parsedCookie[cookieName] = tryDecodeURIComponent(cookieValue);
      if (name) break;
    }
  }
  return parsedCookie;
};
var _serialize = (name, value, opt = {}) => {
  if (!validCookieNameRegEx.test(name)) throw new Error("Invalid cookie name");
  let cookie = `${name}=${value}`;
  if (/^__secure-/i.test(name) && !opt.secure) throw new Error("__Secure- Cookie must have Secure attributes");
  if (/^__host-/i.test(name)) {
    if (!opt.secure) throw new Error("__Host- Cookie must have Secure attributes");
    if (opt.path !== "/") throw new Error('__Host- Cookie must have Path attributes with "/"');
    if (opt.domain) throw new Error("__Host- Cookie must not have Domain attributes");
  }
  for (const key of [
    "domain",
    "path",
    "sameSite",
    "priority"
  ]) if (opt[key] && /[;\r\n]/.test(opt[key])) throw new Error(`${key} must not contain ";", "\\r", or "\\n"`);
  if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
    if (opt.maxAge > 3456e4) throw new Error("Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration.");
    cookie += `; Max-Age=${opt.maxAge | 0}`;
  }
  if (opt.domain && opt.prefix !== "host") cookie += `; Domain=${opt.domain}`;
  if (opt.path) cookie += `; Path=${opt.path}`;
  if (opt.expires) {
    if (opt.expires.getTime() - Date.now() > 3456e7) throw new Error("Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future.");
    cookie += `; Expires=${opt.expires.toUTCString()}`;
  }
  if (opt.httpOnly) cookie += "; HttpOnly";
  if (opt.secure) cookie += "; Secure";
  if (opt.sameSite) cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
  if (opt.priority) cookie += `; Priority=${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}`;
  if (opt.partitioned) {
    if (!opt.secure) throw new Error("Partitioned Cookie must have Secure attributes");
    cookie += "; Partitioned";
  }
  return cookie;
};
var serialize = (name, value, opt) => {
  value = encodeURIComponent(value);
  return _serialize(name, value, opt);
};

// node_modules/hono/dist/helper/cookie/index.js
var getCookie = (c, key, prefix) => {
  const cookie = c.req.raw.headers.get("Cookie");
  if (typeof key === "string") {
    if (!cookie) return;
    let finalKey = key;
    if (prefix === "secure") finalKey = "__Secure-" + key;
    else if (prefix === "host") finalKey = "__Host-" + key;
    return parse(cookie, finalKey)[finalKey];
  }
  if (!cookie) return {};
  return parse(cookie);
};
var generateCookie = (name, value, opt) => {
  let cookie;
  if (opt?.prefix === "secure") cookie = serialize("__Secure-" + name, value, {
    path: "/",
    ...opt,
    secure: true
  });
  else if (opt?.prefix === "host") cookie = serialize("__Host-" + name, value, {
    ...opt,
    path: "/",
    secure: true,
    domain: void 0
  });
  else cookie = serialize(name, value, {
    path: "/",
    ...opt
  });
  return cookie;
};
var setCookie = (c, name, value, opt) => {
  const cookie = generateCookie(name, value, opt);
  c.header("Set-Cookie", cookie, { append: true });
};

// src/server/routes/auth.ts
var LINK_TTL_MS = 6e4;
var EXPIRED = "This link has expired. Run /runwell or npx runwell again.";
function safeTo(to) {
  return typeof to === "string" && to.startsWith("/") && !to.startsWith("//") && !to.includes("\\") ? to : "/";
}
function authRoutes(app, ctx) {
  const nonces = /* @__PURE__ */ new Map();
  app.post("/api/auth/link", async (c) => {
    if (c.get("via") !== "bearer") return c.text("Unauthorized", 401);
    let body = {};
    try {
      body = await c.req.json();
    } catch {
    }
    const now = ctx.now();
    for (const [n, v] of nonces) if (now - v.at > LINK_TTL_MS) nonces.delete(n);
    const nonce = randomBytes(24).toString("hex");
    const to = safeTo(body.to);
    nonces.set(nonce, { to, at: now });
    const url = new URL(`http://127.0.0.1:${ctx.info.port}/auth`);
    url.searchParams.set("n", nonce);
    url.searchParams.set("to", to);
    return c.json({ url: url.toString() });
  });
  app.get("/auth", (c) => {
    const n = c.req.query("n") ?? "";
    const entry = nonces.get(n);
    nonces.delete(n);
    if (!entry || ctx.now() - entry.at > LINK_TTL_MS) return c.text(EXPIRED, 403);
    const id = randomBytes(32).toString("hex");
    ctx.db.run("INSERT INTO auth_sessions (id, created_at) VALUES (?, ?)", id, ctx.now());
    setCookie(c, "rw", id, { httpOnly: true, sameSite: "Strict", path: "/" });
    return c.redirect(entry.to, 302);
  });
}

// src/server/routes/health.ts
function healthRoutes(app, ctx) {
  app.get("/health", (c) => c.json({ ok: true, version: ctx.info.version, activeRuns: ctx.activeRuns(), pid: ctx.info.pid }));
}

// src/server/security.ts
import { timingSafeEqual } from "node:crypto";
var SAFE = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
function routedPath(raw2) {
  try {
    return decodeURIComponent(raw2).replace(/\/{2,}/g, "/");
  } catch {
    return null;
  }
}
function sameToken(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function allowedHosts(port) {
  return /* @__PURE__ */ new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}
var SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1e3;
function security(opts) {
  return async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    const port = opts.port();
    if (!allowedHosts(port).has(c.req.header("host") ?? "")) return c.text("Forbidden", 403);
    const path = routedPath(new URL(c.req.url).pathname);
    const routed = routedPath(c.req.path);
    if (path === null || routed === null) return c.text("Bad request", 400);
    const isApi = (q) => /^\/api(\/|$)/i.test(q);
    if (!isApi(path) && !isApi(routed) && SAFE.has(c.req.method)) return next();
    const auth = c.req.header("authorization") ?? "";
    if (auth.startsWith("Bearer ") && sameToken(auth.slice(7), opts.token())) {
      c.set("via", "bearer");
      return next();
    }
    const sid = getCookie(c, "rw");
    if (sid && /^[0-9a-f]{16,128}$/.test(sid) && opts.db.get("SELECT id FROM auth_sessions WHERE id = ? AND created_at > ?", sid, (opts.now ?? Date.now)() - SESSION_MAX_MS)) {
      if (!SAFE.has(c.req.method)) {
        const origin = c.req.header("origin");
        if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return c.text("Forbidden", 403);
      }
      c.set("via", "cookie");
      return next();
    }
    return c.text("Unauthorized", 401);
  };
}

// src/server/http.ts
var TOPICS = /* @__PURE__ */ new Set(["runs", "skills", "backfill"]);
function createApp(ctx, extra = []) {
  const app = new Hono3();
  app.use("*", security({ port: () => ctx.info.port, token: () => ctx.info.token, db: ctx.db, now: ctx.now }));
  healthRoutes(app, ctx);
  authRoutes(app, ctx);
  app.all("/api/ping", (c) => c.json({ ok: true }));
  app.get("/api/stream", (c) => {
    const asked = (c.req.query("topics") ?? "runs,skills,backfill").split(",").filter((t) => TOPICS.has(t) || /^run:[A-Za-z0-9_-]{1,64}$/.test(t));
    return streamSSE(c, async (stream2) => {
      const unsub = ctx.hub.subscribe(asked, (topic, data) => void stream2.writeSSE({ event: topic, data: JSON.stringify(data) }));
      const ping = setInterval(() => void stream2.write(": ping\n\n"), 15e3);
      stream2.onAbort(() => {
        clearInterval(ping);
        unsub();
      });
      await new Promise((resolve3) => stream2.onAbort(resolve3));
    });
  });
  for (const add of extra) add(app, ctx);
  return app;
}

// src/server/lifecycle.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { closeSync, openSync, readFileSync as readFileSync3, renameSync as renameSync2, rmSync, writeFileSync as writeFileSync2, writeSync } from "node:fs";
import { createServer as createServer2 } from "node:net";

// src/server/proc.ts
import { execFileSync } from "node:child_process";
import { readFileSync as readFileSync2 } from "node:fs";
function pidCommand(pid) {
  try {
    return readFileSync2(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim() || null;
  } catch {
    try {
      return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { timeout: 2e3 }).toString().trim() || null;
    } catch {
      return null;
    }
  }
}

// src/server/lifecycle.ts
var isRunwellServer = (pid) => {
  const cmd = pidCommand(pid);
  return cmd === null ? true : /server\.js|runwell|vitest|playwright/.test(cmd);
};
function readServerInfo(p) {
  try {
    const v = JSON.parse(readFileSync3(p.serverJson, "utf8"));
    if (typeof v.pid === "number" && typeof v.port === "number" && typeof v.token === "string" && typeof v.version === "string") {
      return { pid: v.pid, port: v.port, token: v.token, version: v.version };
    }
  } catch {
  }
  return null;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function freePort(wanted) {
  const tryPort = (port) => new Promise((resolve3) => {
    const s = createServer2();
    s.once("error", () => resolve3(null));
    s.listen(port, "127.0.0.1", () => {
      const got = s.address().port;
      s.close(() => resolve3(got));
    });
  });
  return tryPort(wanted).then((p) => p ?? tryPort(0).then((q) => q ?? 0));
}
function takeLock(p) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(p.lock, "wx", 384);
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      closeSync(fd);
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let holder = 0;
      try {
        holder = JSON.parse(readFileSync3(p.lock, "utf8")).pid ?? 0;
      } catch {
      }
      if (holder && alive(holder) && isRunwellServer(holder)) return false;
      rmSync(p.lock, { force: true });
    }
  }
  return false;
}
async function acquire(p, port, version = "0.0.0-dev") {
  if (!takeLock(p)) return null;
  const info = { pid: process.pid, port: await freePort(port), token: randomBytes2(32).toString("hex"), version };
  const tmp = `${p.serverJson}.${process.pid}.tmp`;
  writeFileSync2(tmp, JSON.stringify(info), { mode: 384 });
  renameSync2(tmp, p.serverJson);
  let released = false;
  return {
    info,
    release() {
      if (released) return;
      released = true;
      if (readServerInfo(p)?.pid === process.pid) rmSync(p.serverJson, { force: true });
      rmSync(p.lock, { force: true });
    }
  };
}
function idleWatch(opts) {
  const now = opts.now ?? Date.now;
  let last = now();
  let fired = false;
  const timer = setInterval(() => {
    if (fired) return;
    if (opts.isBusy()) {
      last = now();
      return;
    }
    if (now() - last >= opts.idleMs) {
      fired = true;
      opts.onIdle();
    }
  }, Math.max(50, Math.min(opts.idleMs / 4, 6e4)));
  timer.unref?.();
  return {
    touch: () => {
      last = now();
    },
    stop: () => clearInterval(timer)
  };
}

// src/server/paths.ts
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function isRunwellFolder(path, root) {
  const p = path.replace(/\/+$/, "");
  return p === root || p.startsWith(`${root}/`) || /(^|\/)runwell-draw-[^/]*$/.test(p);
}
function paths(home) {
  const root = home ?? process.env.RUNWELL_HOME ?? join(homedir(), ".runwell");
  mkdirSync(root, { recursive: true, mode: 448 });
  const runs = join(root, "runs");
  const runDir = (id) => join(runs, id);
  return {
    root,
    db: join(root, "runwell.db"),
    serverJson: join(root, "server.json"),
    lock: join(root, "server.lock"),
    configJson: join(root, "config.json"),
    runs,
    workflows: join(root, "workflows"),
    runDir,
    events: (id) => join(runDir(id), "events.jsonl"),
    inputs: (id) => join(runDir(id), "inputs"),
    work: (id) => join(runDir(id), "work"),
    outputs: (id) => join(runDir(id), "outputs"),
    workflowJson: (id) => join(runDir(id), "workflow.json")
  };
}

// src/server/services.ts
import { spawn as spawn4 } from "node:child_process";
import { homedir as homedir9, platform } from "node:os";
import { dirname as dirname2, join as join15 } from "node:path";
import { fileURLToPath } from "node:url";

// src/server/asks.ts
import { randomBytes as randomBytes3 } from "node:crypto";
function createAskBroker(deps) {
  const open = /* @__PURE__ */ new Map();
  return {
    open(runId, input) {
      const id = randomBytes3(8).toString("hex");
      const agentId = input.agentId ?? (input.toolCallId ? deps.agentOfCall(runId, input.toolCallId) : null);
      const ask = { ...input, id, agentId };
      let resolve3;
      const answer = new Promise((r) => resolve3 = r);
      const asks = open.get(runId) ?? /* @__PURE__ */ new Map();
      asks.set(id, { ask, resolve: resolve3 });
      open.set(runId, asks);
      deps.append(runId, { t: "ask", at: deps.now(), ask });
      return { id, answer };
    },
    answer(runId, askId, a) {
      const entry = open.get(runId)?.get(askId);
      if (!entry) return "gone";
      if (entry.ask.kind !== a.kind) return "mismatch";
      open.get(runId).delete(askId);
      deps.append(runId, { t: "ask.done", at: deps.now(), id: askId, answer: a });
      entry.resolve(a);
      return "ok";
    },
    closeRun(runId) {
      const asks = open.get(runId);
      if (!asks) return;
      open.delete(runId);
      for (const [id, entry] of asks) {
        deps.append(runId, { t: "ask.done", at: deps.now(), id, answer: null });
        entry.resolve(null);
      }
    },
    pending: (runId) => [...open.get(runId)?.values() ?? []].map((e) => e.ask)
  };
}
function parseAnswer(v) {
  if (!v || typeof v !== "object") return null;
  const a = v;
  if (a.kind === "permission" && typeof a.allow === "boolean") {
    return { kind: "permission", allow: a.allow, message: typeof a.message === "string" ? a.message.slice(0, 2e3) : null };
  }
  if (a.kind === "question" && a.answers && typeof a.answers === "object" && !Array.isArray(a.answers)) {
    const answers = {};
    for (const [k, val] of Object.entries(a.answers)) if (typeof val === "string") answers[k.slice(0, 2e3)] = val.slice(0, 4e3);
    return { kind: "question", answers };
  }
  return null;
}

// src/server/backfill.ts
import { copyFileSync as copyFileSync2, lstatSync as lstatSync2, mkdirSync as mkdirSync4, readdirSync as readdirSync5, statSync as statSync5, writeFileSync as writeFileSync4 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { isAbsolute as isAbsolute2, join as join7, relative as relative2, resolve as resolve2, sep as sep2 } from "node:path";

// src/server/outputs.ts
import { createHash, createHmac, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync as mkdirSync2, readFileSync as readFileSync4, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir as homedir2, tmpdir } from "node:os";
import { isAbsolute, join as join2, relative, resolve, sep } from "node:path";
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", "dist", "build", ".next", "out", "target", ".venv", "__pycache__", ".cache"]);
var SCAN_LIMIT = 2e4;
var MTIME_SLACK_MS = 2e3;
function gitignore(root) {
  let lines2 = [];
  try {
    lines2 = readFileSync4(join2(root, ".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
  } catch {
    return () => false;
  }
  return (rel, isDir) => {
    const parts = rel.split("/");
    const name = parts.at(-1);
    return lines2.some((raw2) => {
      const dirOnly = raw2.endsWith("/");
      const anchored = raw2.startsWith("/");
      const pat = raw2.replace(/^\//, "").replace(/\/$/, "");
      if (dirOnly && !isDir) return parts.slice(0, -1).some((p) => p === pat);
      if (pat.startsWith("*.")) return name.endsWith(pat.slice(1));
      if (anchored) return rel === pat || rel.startsWith(pat + "/");
      return parts.includes(pat);
    });
  };
}
function walk(root, visit, opts) {
  let seen = 0;
  const stack = [""];
  while (stack.length && seen < SCAN_LIMIT) {
    const relDir = stack.pop();
    let entries;
    try {
      entries = readdirSync(join2(root, relDir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (++seen > SCAN_LIMIT) break;
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (opts.skipDirs && (SKIP_DIRS.has(e.name) || e.name.startsWith("."))) continue;
        if (opts.ignored?.(rel, true)) continue;
        stack.push(rel);
      } else if (e.isFile()) {
        if (opts.skipDirs && e.name.startsWith(".")) continue;
        if (opts.ignored?.(rel, false)) continue;
        visit(rel, join2(root, rel));
      }
    }
  }
}
var sha2562 = (file) => createHash("sha256").update(readFileSync4(file)).digest("hex");
function writtenPaths(events) {
  const out = [];
  for (const e of events) {
    if (e.t !== "tool.start" || !WRITE_TOOLS.has(e.name)) continue;
    const p = e.input.file_path ?? e.input.notebook_path;
    if (typeof p === "string" && isAbsolute(p)) out.push(p);
  }
  return out;
}
var inside = (root, abs) => {
  const rel = relative(root, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};
var NAMED_FILE = /(?:~|\/)[^\s"'`<>()|;&*?\\]+?\.(?:mp4|mov|webm|gif|png|jpe?g|webp|svg|pdf|html?|md|csv|tsv|xlsx|docx|pptx|mp3|wav|m4a|zip|txt|json)(?![\w.])/gi;
function pointedFiles(events, window, skip, home) {
  const texts = [];
  for (const e of events) {
    if (e.t === "text") texts.push(e.text);
    else if (e.t === "tool.start") texts.push(JSON.stringify(e.input));
    else if (e.t === "tool.end") texts.push(e.result);
  }
  const seen = /* @__PURE__ */ new Map();
  const temp = [tmpdir(), "/tmp", "/var/folders", "/private/var"].filter((d) => !(home + sep).startsWith(d + sep));
  for (const t of texts) {
    for (const m of t.replace(/\\n/g, " ").matchAll(NAMED_FILE)) {
      const raw2 = m[0];
      const abs = resolve(raw2.startsWith("~/") ? join2(home, raw2.slice(2)) : raw2);
      if (seen.has(abs) || !abs.startsWith(home + sep)) continue;
      if (relative(home, abs).split(sep).some((part) => part.startsWith("."))) continue;
      if ([...skip, ...temp].some((d) => abs === d || abs.startsWith(d + sep))) continue;
      try {
        const st = lstatSync(abs);
        if (!st.isFile() || st.mtimeMs < window.from || st.mtimeMs > window.to) continue;
      } catch {
        continue;
      }
      seen.set(abs, `~/${relative(home, abs).split(sep).join("/")}`);
      if (seen.size >= 20) break;
    }
  }
  return [...seen].map(([abs, rel]) => ({ abs, rel }));
}
function collectOutputs(run3, events, cfg, p, home = homedir2()) {
  const from = (run3.startedAt ?? run3.createdAt) - MTIME_SLACK_MS;
  const to = (run3.endedAt ?? Date.now()) + MTIME_SLACK_MS;
  const own = run3.place === "folder" ? p.work(run3.id) : run3.projectPath ?? run3.cwd;
  const pointed = pointedFiles(events, { from, to }, [own, p.root], home);
  const rows = [];
  const found = /* @__PURE__ */ new Map();
  if (run3.place === "folder") {
    walk(own, (rel, abs) => {
      const st = statSync(abs);
      rows.push({ runId: run3.id, path: rel, label: "written", kind: outputKind(rel), bytes: st.size, mtime: Math.round(st.mtimeMs), copied: false, hash: null });
    }, { skipDirs: false });
  } else {
    for (const abs of writtenPaths(events)) {
      if (!inside(own, abs)) continue;
      try {
        if (!lstatSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      found.set(relative(own, abs).split(sep).join("/"), { abs, label: "written" });
    }
    walk(own, (rel, abs) => {
      if (found.has(rel)) return;
      const m = statSync(abs).mtimeMs;
      if (m >= from && m <= to) found.set(rel, { abs, label: "probably" });
    }, { skipDirs: true, ignored: gitignore(own) });
  }
  const written = new Set(writtenPaths(events).map((a) => resolve(a)));
  for (const f of pointed) found.set(f.rel, { abs: f.abs, label: written.has(f.abs) ? "written" : "probably" });
  let copiedBytes = 0;
  for (const [rel, { abs, label }] of found) {
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let copied = false;
    let hash = null;
    if (st.size <= cfg.copyFileCapBytes && copiedBytes + st.size <= cfg.copyRunCapBytes) {
      try {
        const dest = join2(p.outputs(run3.id), rel);
        mkdirSync2(join2(dest, ".."), { recursive: true });
        copyFileSync(abs, dest);
        copied = true;
        copiedBytes += st.size;
      } catch {
        continue;
      }
    } else {
      try {
        hash = sha2562(abs);
      } catch {
        continue;
      }
    }
    rows.push({ runId: run3.id, path: rel, label, kind: outputKind(rel), bytes: st.size, mtime: Math.round(st.mtimeMs), copied, hash });
  }
  return rows;
}
function outputFile(run3, rel, p) {
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return null;
  const base = run3.place === "folder" && !rel.startsWith("~/") ? p.work(run3.id) : p.outputs(run3.id);
  const abs = join2(base, rel);
  try {
    const real = realpathSync(abs);
    const realBase = realpathSync(base);
    if (!real.startsWith(realBase + sep)) return null;
    return statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}
var grantKey = (token) => createHmac("sha256", token).update("runwell-output-grant-v1").digest();
function grantFor(token, runId, now) {
  const exp = now + 36e5;
  const mac = createHmac("sha256", grantKey(token)).update(`${runId}:${exp}`).digest("base64url");
  return `${exp}.${mac}`;
}
function checkGrant(token, runId, grant, now) {
  const [expStr, mac] = grant.split(".");
  const exp = Number(expStr);
  if (!mac || !Number.isFinite(exp) || exp < now) return false;
  const want = Buffer.from(createHmac("sha256", grantKey(token)).update(`${runId}:${exp}`).digest("base64url"));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual2(want, got);
}
var toOut = (r) => ({ runId: r.run_id, path: r.path, label: r.label, kind: r.kind, bytes: r.bytes, mtime: r.mtime, copied: !!r.copied, hash: r.hash });
function createOutputsService(deps) {
  return {
    async collect(run3, events) {
      const rows = collectOutputs(run3, events, deps.config(), deps.paths);
      deps.db.tx(() => {
        deps.db.run("DELETE FROM outputs WHERE run_id = ?", run3.id);
        for (const r of rows) {
          deps.db.run("INSERT INTO outputs (run_id, path, label, kind, bytes, mtime, copied, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", r.runId, r.path, r.label, r.kind, r.bytes, r.mtime, r.copied ? 1 : 0, r.hash);
        }
      });
    },
    list: (runId) => deps.db.all("SELECT * FROM outputs WHERE run_id = ? ORDER BY path", runId).map(toOut),
    recent(q) {
      const where = ["1 = 1"];
      const params = [];
      if (q.skill) where.push("r.skill_key = ?"), params.push(q.skill);
      if (q.kind) where.push("o.kind = ?"), params.push(q.kind);
      if (q.before) where.push("r.created_at < ?"), params.push(q.before);
      params.push(Math.min(Math.max(q.limit ?? 60, 1), 500));
      return deps.db.all(
        `SELECT o.*, r.skill_ref, r.n, r.created_at FROM outputs o JOIN runs r ON r.id = o.run_id WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC, o.path LIMIT ?`,
        ...params
      ).map((r) => ({ ...toOut(r), skillRef: r.skill_ref, runN: r.n, runCreatedAt: r.created_at }));
    },
    grant: (runId) => grantFor(deps.token(), runId, deps.now()),
    checkGrant: (runId, grant) => checkGrant(deps.token(), runId, grant, deps.now()),
    file: (run3, rel) => outputFile(run3, rel, deps.paths),
    reveal: (file) => deps.reveal(file)
  };
}

// src/server/runs.ts
import { randomBytes as randomBytes4 } from "node:crypto";
import { appendFileSync, cpSync, existsSync as existsSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync6, readdirSync as readdirSync3, renameSync as renameSync3, rmSync as rmSync2, statSync as statSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { basename as basename2, extname, join as join5 } from "node:path";

// src/shared/graph/names.ts
var TRAILING = /(?:\s*[-–—:,]?\s*(?:\bv\s?\d+|\bversion\s*\d+|\bpass\s*#?\d+|\bround\s*#?\d+))+$/i;
function baseAgentName(name) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.replace(TRAILING, "").trim() || trimmed;
}
function normalizeAgentName(name) {
  return baseAgentName(name).toLowerCase();
}
function matchesDeclared(runtime, declared) {
  const d = normalizeAgentName(declared);
  if (d === "") return false;
  const r = normalizeAgentName(runtime);
  return r === d || r.startsWith(d) && /[^\p{L}\p{N}_]/u.test(r[d.length]);
}
function placeDeclared(candidates, fromStep, fromLoop, runtime) {
  let best = null;
  for (const c of candidates) {
    const rank = c.stepId === fromStep ? 0 : fromLoop !== null && c.loopId === fromLoop ? 1 : -1;
    if (rank < 0 || !matchesDeclared(runtime, c.name)) continue;
    const len = normalizeAgentName(c.name).length;
    if (!best || rank < best.rank || rank === best.rank && len > best.len) best = { c, rank, len };
  }
  return best?.c ?? null;
}

// src/shared/graph/passes.ts
function flattenToolCalls(messages) {
  return messages.flatMap(
    (m) => m.role === "assistant" ? m.contentBlocks.flatMap((b) => b.type === "tool_call" ? [b.toolCall] : []) : []
  );
}
function todoEntries(call) {
  if (call.toolName !== "todo_write") return null;
  const todos = call.args?.todos;
  if (!Array.isArray(todos)) return null;
  const out = [];
  for (const t of todos) {
    if (!t || typeof t !== "object") continue;
    const item = t;
    if (typeof item.id !== "string" || typeof item.status !== "string") continue;
    out.push({
      id: item.id,
      status: item.status,
      note: typeof item.note === "string" ? item.note : null,
      outputs: Array.isArray(item.outputs) ? item.outputs.filter((o) => typeof o === "string") : []
    });
  }
  return out;
}
function inferPasses(messages, loop, agentKey) {
  if (!loop.childIds.length) return [];
  const children = new Set(loop.childIds);
  const passes = [];
  const prev = /* @__PURE__ */ new Map();
  let doneInPass = /* @__PURE__ */ new Set();
  let agentsInPass = /* @__PURE__ */ new Map();
  let leadActed = false;
  let workAfterAgents = null;
  let open = null;
  const start = (index) => {
    passes.push({ pass: passes.length + 1, startIndex: index });
    doneInPass = /* @__PURE__ */ new Set();
    agentsInPass = /* @__PURE__ */ new Map();
  };
  flattenToolCalls(messages).forEach((call, index) => {
    const entries = todoEntries(call);
    if (entries) {
      const named = entries.filter((e) => e.id === loop.id || children.has(e.id));
      if (named.length) open = named.some((e) => e.status === "in_progress");
      const mine = entries.filter((e) => children.has(e.id));
      const entering = mine.filter((e) => e.status === "in_progress" && prev.get(e.id) !== "in_progress");
      if (entering.length && (passes.length === 0 || entering.some((e) => doneInPass.has(e.id)))) start(index);
      else for (const e of mine) if (e.status === "completed" && prev.get(e.id) !== "completed") doneInPass.add(e.id);
      for (const e of mine) prev.set(e.id, e.status);
    }
    if (call.toolName === "todo_write") {
      leadActed = true;
      return;
    }
    const key = call.toolName === "subagent" && open !== false ? agentKey?.(call, index) ?? null : null;
    if (key === null) {
      if (call.toolName !== "subagent") {
        leadActed = true;
        workAfterAgents ??= index;
      }
      return;
    }
    const before = agentsInPass.get(key);
    if (passes.length === 0) start(index);
    else if (before !== void 0 && before !== "error" && leadActed) start(workAfterAgents ?? index);
    agentsInPass.set(key, call.status);
    leadActed = false;
    workAfterAgents = null;
  });
  return passes;
}
function passAt(passes, index) {
  return passes.findLast((p) => p.startIndex <= index)?.pass ?? null;
}

// src/shared/graph/scan.ts
var resolveStep = (shape, id) => shape.nodeIds.has(id) ? id : shape.regionFirst.get(id) ?? null;
function scanRun(messages, shape) {
  const events = [];
  let current = shape.firstStep;
  let index = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const b of m.contentBlocks) {
      if (b.type === "text") {
        if (b.text.trim()) events.push({ kind: "text", text: b.text, stepId: current, index });
        continue;
      }
      if (b.type !== "tool_call") continue;
      const call = b.toolCall;
      const entries = todoEntries(call);
      if (entries) {
        events.push({ kind: "todo", call, entries, index });
        const active = entries.filter((e) => e.status === "in_progress").map((e) => resolveStep(shape, e.id)).filter((id) => id !== null);
        if (active.length) current = active[active.length - 1];
      } else if (call.toolName !== "todo_write") {
        events.push({ kind: "call", call, stepId: current, index });
      }
      index += 1;
    }
  }
  return events;
}
var oneLine = (s, max) => {
  const line = s.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}\u2026` : line;
};
function agentName(call) {
  const description = call.args?.description;
  if (typeof description === "string" && description.trim()) return oneLine(description, 60);
  const task = call.args?.task;
  return typeof task === "string" && task.trim() ? oneLine(task, 60) : "Subagent";
}
function firstLine(s) {
  return s ? oneLine(s, 200) || null : null;
}
var TARGET_KEYS = ["path", "file_path", "filePath", "url", "query", "command", "pattern", "app", "description", "name"];
function summarizeCall(call) {
  const key = TARGET_KEYS.find((k) => typeof call.args?.[k] === "string" && call.args[k].trim());
  return {
    id: call.toolCallId,
    name: call.toolName,
    target: key ? oneLine(call.args[key], 80) : "",
    status: call.status === "done" ? "done" : call.status === "error" ? "error" : "running",
    result: call.result ?? null,
    startedAt: call.startedAt ?? null,
    endedAt: call.endedAt ?? null
  };
}
var textsOf = (blocks) => (blocks ?? []).flatMap((b) => b.type === "text" && b.text.trim() ? [b.text] : []);
var withoutUsage = (result) => (result ?? "").replace(/\n*\[subagent usage\][^\n]*\s*$/, "").trim();
function finalText(call) {
  const result = withoutUsage(call.result);
  if (result) return result;
  return textsOf(call.subagentBlocks).at(-1) ?? null;
}
function agentOutput(call) {
  const texts = textsOf(call.subagentBlocks);
  const result = withoutUsage(call.result);
  return texts.length ? texts : result ? [result] : [];
}
function agentToolCalls(call) {
  return (call.subagentBlocks ?? []).flatMap((b) => b.type === "tool_call" ? [summarizeCall(b.toolCall)] : []);
}
function parseVerdict(text) {
  const last = text?.split("\n").map((l) => l.trim()).filter(Boolean).at(-1);
  const m = last?.replace(/^[*_\s]+|[*_\s.]+$/g, "").match(/^verdict:\s*(accept|reject)$/i);
  return m ? m[1].toLowerCase() : null;
}
function agentNoun(roles, count) {
  const words = roles.map((r) => r?.trim().toLowerCase().match(/([a-z]+)\W*$/)?.[1]);
  const word = words.length && words.every((w) => w && w === words[0]) ? words[0] : "agent";
  return count === 1 ? word : `${word}s`;
}

// src/shared/graph/build.ts
var emptyDetail = (role) => ({
  role,
  brief: null,
  toolCalls: [],
  output: [],
  outputs: [],
  verdict: null,
  startedAt: null,
  endedAt: null
});
function skeletonOf(steps) {
  const spine = [];
  const loops = [];
  const walk3 = (list, loopId, prefix) => {
    list.forEach((s, i) => {
      const tile = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const children = s.children ?? [];
      if (children.length) {
        const loop = {
          id: s.id,
          title: s.title,
          childIds: children.map((c) => c.id),
          nodeIds: [],
          maxPasses: typeof s.maxPasses === "number" && s.maxPasses > 0 ? s.maxPasses : null
        };
        loops.push(loop);
        const from = spine.length;
        walk3(children, s.id, tile);
        loop.nodeIds = spine.slice(from).map((n) => n.id);
        return;
      }
      spine.push({
        id: s.id,
        kind: s.kind === "decision" ? "decision" : s.kind === "loop" ? "loop-step" : "step",
        label: s.title,
        tile,
        loopId,
        ...s.kind === "decision" && s.branches ? { branches: s.branches } : {},
        agents: Array.isArray(s.agents) ? s.agents.filter((a) => typeof a?.name === "string" && a.name.trim()).map((a) => ({ name: a.name, role: typeof a.role === "string" ? a.role : "" })) : []
      });
    });
  };
  walk3(steps, null, "");
  return { spine, loops };
}
function stepsFromDepth(rows) {
  const roots = [];
  const stack = [];
  for (const row of rows) {
    const step = { id: row.id, title: row.title, detail: "", kind: "action" };
    while (stack.length && stack[stack.length - 1].depth >= row.depth) stack.pop();
    const parent = stack[stack.length - 1]?.step;
    if (parent) {
      parent.kind = "loop";
      (parent.children ??= []).push(step);
    } else roots.push(step);
    stack.push({ depth: row.depth, step });
  }
  return roots;
}
var initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || null;
var callState = (call) => call.status === "done" ? "done" : call.status === "error" ? "failed" : "running";
var parseTime = (iso2) => {
  const t = iso2 ? Date.parse(iso2) : NaN;
  return Number.isNaN(t) ? null : t;
};
function core(input, isStatic) {
  const { live, messages } = input;
  const skeleton = skeletonOf(input.overviewSteps?.length ? input.overviewSteps : stepsFromDepth(input.steps));
  const rows = new Map(input.steps.map((r) => [r.id, r]));
  const loopById = new Map(skeleton.loops.map((l) => [l.id, l]));
  const spineById = new Map(skeleton.spine.map((s) => [s.id, s]));
  const shape = {
    nodeIds: new Set(skeleton.spine.map((s) => s.id)),
    regionFirst: new Map(skeleton.loops.flatMap((l) => l.nodeIds[0] ? [[l.id, l.nodeIds[0]]] : [])),
    firstStep: null
  };
  const firstId = input.steps[0]?.id ?? skeleton.spine[0]?.id;
  shape.firstStep = firstId ? shape.nodeIds.has(firstId) ? firstId : shape.regionFirst.get(firstId) ?? null : null;
  const events = scanRun(messages, shape);
  const declaredCandidates = skeleton.spine.flatMap(
    (s) => s.agents.map((a, index) => ({ stepId: s.id, loopId: s.loopId, index, name: a.name }))
  );
  const placed = /* @__PURE__ */ new Map();
  for (const ev of events) {
    if (ev.kind !== "call" || !ev.stepId || ev.call.toolName !== "subagent") continue;
    if (ev.call.status === "streaming_args") continue;
    const name = agentName(ev.call);
    const hit = placeDeclared(declaredCandidates, ev.stepId, spineById.get(ev.stepId)?.loopId ?? null, name);
    placed.set(ev.index, { stepId: hit?.stepId ?? ev.stepId, spawnedIn: ev.stepId, declared: hit?.index ?? null, name });
  }
  const agentKeyIn = (loopId) => (_call, index) => {
    const p = placed.get(index);
    if (!p || spineById.get(p.spawnedIn)?.loopId !== loopId || spineById.get(p.stepId)?.loopId !== loopId) return null;
    return p.declared !== null ? `declared:${p.stepId}:${p.declared}` : `name:${p.stepId}:${normalizeAgentName(p.name)}`;
  };
  const loopPasses = new Map(skeleton.loops.map((l) => [l.id, inferPasses(messages, { id: l.id, childIds: l.childIds }, agentKeyIn(l.id))]));
  const currentPass = (loopId) => loopPasses.get(loopId)?.at(-1)?.pass ?? null;
  const passKey = (nodeId, index) => {
    const loopId = spineById.get(nodeId)?.loopId;
    return loopId ? passAt(loopPasses.get(loopId) ?? [], index) ?? 1 : 0;
  };
  const stepDetails = /* @__PURE__ */ new Map();
  const detailOf = (id, key) => {
    let byPass = stepDetails.get(id);
    if (!byPass) stepDetails.set(id, byPass = /* @__PURE__ */ new Map());
    let d = byPass.get(key);
    if (!d) byPass.set(key, d = emptyDetail("lead"));
    return d;
  };
  const agentSlots = new Map(
    skeleton.spine.map((s) => [s.id, s.agents.map((a, i) => ({ name: a.name.trim(), role: a.role, declared: i, runs: /* @__PURE__ */ new Map() }))])
  );
  const prevStatus = /* @__PURE__ */ new Map();
  const activeKey = /* @__PURE__ */ new Map();
  const prevOutputs = /* @__PURE__ */ new Map();
  for (const ev of events) {
    if (ev.kind === "text") {
      if (ev.stepId) detailOf(ev.stepId, passKey(ev.stepId, ev.index)).output.push(ev.text);
    } else if (ev.kind === "call") {
      if (!ev.stepId) continue;
      if (ev.call.toolName !== "subagent") {
        detailOf(ev.stepId, passKey(ev.stepId, ev.index)).toolCalls.push(summarizeCall(ev.call));
        continue;
      }
      const place = placed.get(ev.index);
      if (!place) continue;
      const key = passKey(place.stepId, ev.index);
      const slots = agentSlots.get(place.stepId);
      const norm = normalizeAgentName(place.name);
      let slot = place.declared !== null ? slots.find((s) => s.declared === place.declared) : slots.find((s) => s.role === void 0 && normalizeAgentName(s.name) === norm && (!s.runs.has(key) || s.runs.get(key).status === "error"));
      if (!slot) slots.push(slot = { name: baseAgentName(place.name), runs: /* @__PURE__ */ new Map() });
      slot.runs.set(key, ev.call);
    } else {
      for (const e of ev.entries) {
        if (!shape.nodeIds.has(e.id)) continue;
        const before = prevStatus.get(e.id);
        const starting = e.status === "in_progress" && before !== "in_progress";
        if (starting) activeKey.set(e.id, passKey(e.id, ev.index));
        const d = detailOf(e.id, activeKey.get(e.id) ?? passKey(e.id, ev.index));
        if (starting) d.startedAt ??= ev.call.startedAt ?? ev.call.endedAt ?? null;
        if (e.status === "completed" && before !== "completed") d.endedAt = ev.call.endedAt ?? ev.call.startedAt ?? null;
        prevStatus.set(e.id, e.status);
        const seen = prevOutputs.get(e.id) ?? /* @__PURE__ */ new Set();
        for (const o of e.outputs) if (!seen.has(o)) {
          seen.add(o);
          d.outputs.push(o);
        }
        prevOutputs.set(e.id, seen);
      }
    }
  }
  if (input.outputs) {
    const tracked = /* @__PURE__ */ new Map();
    for (const o of input.outputs) {
      if (!o.stepId) continue;
      const list = tracked.get(o.stepId) ?? [];
      if (!list.includes(o.path)) list.push(o.path);
      tracked.set(o.stepId, list);
    }
    for (const s of skeleton.spine) {
      const mine = tracked.get(s.id) ?? [];
      const byPass = stepDetails.get(s.id);
      const keys = [...byPass?.keys() ?? []].sort((a, b) => a - b);
      const shown = /* @__PURE__ */ new Set();
      for (const k of keys) {
        const d = byPass.get(k);
        const paths2 = [];
        for (const raw2 of d.outputs) {
          const hit = mine.find((p) => raw2 === p || raw2.endsWith(`/${p}`));
          if (hit && !shown.has(hit)) {
            shown.add(hit);
            paths2.push(hit);
          }
        }
        d.outputs = paths2;
      }
      const rest = mine.filter((p) => !shown.has(p));
      if (rest.length) detailOf(s.id, keys.at(-1) ?? (s.loopId ? currentPass(s.loopId) ?? 1 : 0)).outputs.push(...rest);
    }
  }
  const unrun = isStatic || live ? "waiting" : "not_run";
  const stopped = !isStatic && !live;
  const nodes = [];
  const order2 = [];
  const fanouts = [];
  for (const s of skeleton.spine) {
    const row = rows.get(s.id);
    const byPass = stepDetails.get(s.id);
    const keys = [...byPass?.keys() ?? []].sort((a, b) => a - b);
    const latest = keys.at(-1);
    const detail = latest !== void 0 ? byPass.get(latest) : emptyDetail("lead");
    detail.startedAt ??= parseTime(row?.startedAt);
    detail.endedAt ??= parseTime(row?.finishedAt);
    const state = !row || row.status === "pending" ? unrun : row.status === "running" ? stopped ? "stopped" : "running" : row.status;
    nodes.push({
      id: s.id,
      kind: s.kind,
      label: s.label,
      tile: s.tile,
      line: state === "stopped" ? "Stopped here" : row?.note ?? null,
      state,
      parentId: s.loopId,
      pass: s.loopId && latest ? latest : null,
      passes: keys.length > 1 ? Object.fromEntries(keys.map((k) => [k, byPass.get(k)])) : null,
      detail,
      ...s.branches ? { branches: s.branches } : {}
    });
    order2.push(s.id);
    const slots = agentSlots.get(s.id);
    const agentIds = [];
    const loopPass = s.loopId ? currentPass(s.loopId) : null;
    slots.forEach((slot, i) => {
      const declared = slot.role !== void 0;
      const runKeys = [...slot.runs.keys()].sort((a, b) => a - b);
      const details = new Map(runKeys.map((k) => {
        const call = slot.runs.get(k);
        const task = call.args?.task;
        const d = {
          role: "subagent",
          brief: typeof task === "string" ? task : null,
          toolCalls: agentToolCalls(call),
          output: agentOutput(call),
          outputs: [],
          verdict: declared ? parseVerdict(finalText(call)) : null,
          startedAt: call.startedAt ?? null,
          endedAt: call.endedAt ?? null
        };
        return [k, d];
      }));
      const lastKey = runKeys.at(-1);
      const lastCall = lastKey !== void 0 ? slot.runs.get(lastKey) : null;
      const detail2 = lastKey !== void 0 ? details.get(lastKey) : emptyDetail("subagent");
      let state2 = lastCall ? callState(lastCall) : unrun;
      if (state2 === "running" && stopped) state2 = "stopped";
      if (declared && live && lastKey !== void 0 && loopPass !== null && loopPass > lastKey && state2 !== "running") state2 = "waiting";
      const line = state2 === "stopped" ? "Stopped here" : state2 === "failed" ? firstLine(lastCall?.result) ?? "Failed" : detail2.verdict ? detail2.verdict === "accept" ? "Accepted" : "Rejected" : declared ? slot.role || null : null;
      const id = `${s.id}/agent-${i + 1}`;
      nodes.push({
        id,
        kind: "agent",
        label: slot.name,
        tile: initials(slot.name),
        line,
        state: state2,
        parentId: s.id,
        pass: s.loopId && lastKey ? lastKey : null,
        passes: runKeys.length > 1 ? Object.fromEntries(runKeys.map((k) => [k, details.get(k)])) : null,
        detail: detail2,
        ...declared ? { role: slot.role } : {}
      });
      agentIds.push(id);
    });
    order2.push(...agentIds);
    if (agentIds.length) {
      const passes = slots.flatMap((sl) => [...sl.runs.keys()]).filter((k) => k > 0);
      fanouts.push({
        id: `fanout:${s.id}`,
        kind: "fanout",
        stepId: s.id,
        title: `${agentIds.length} ${agentNoun(slots.map((sl) => sl.role), agentIds.length)}`,
        nodeIds: agentIds,
        pass: passes.length ? Math.max(...passes) : null,
        maxPasses: s.loopId ? loopById.get(s.loopId)?.maxPasses ?? null : null
      });
    }
  }
  const groups = [
    ...skeleton.loops.map((l) => ({
      id: `loop:${l.id}`,
      kind: "loop",
      stepId: l.id,
      title: l.title,
      nodeIds: l.nodeIds,
      pass: isStatic ? null : currentPass(l.id),
      maxPasses: l.maxPasses
    })),
    ...fanouts
  ];
  return { nodes, groups, order: order2, header: headerOf(nodes, groups, input, isStatic) };
}
function headerOf(nodes, groups, input, isStatic) {
  const spine = nodes.filter((n) => n.kind === "step" || n.kind === "decision" || n.kind === "loop-step");
  const runningAt = spine.findLastIndex((n) => n.state === "running");
  const current = runningAt >= 0 ? spine[runningAt] : null;
  const loop = current?.parentId ? groups.find((g) => g.kind === "loop" && g.stepId === current.parentId) : void 0;
  return {
    stepIndex: current ? runningAt + 1 : spine.filter((n) => n.state === "done" || n.state === "skipped").length,
    stepTotal: spine.length,
    stepTitle: current?.label ?? null,
    agentsWorking: nodes.filter((n) => n.kind === "agent" && n.state === "running").length,
    pass: loop?.pass ?? null,
    maxPasses: loop?.maxPasses ?? null,
    stepsLeft: spine.filter((n) => n.state === "waiting").length,
    failed: nodes.filter((n) => n.state === "failed").length,
    done: !isStatic && !input.live
  };
}
function buildRunGraph(input) {
  return core(input, false);
}

// src/shared/graph/from-events.ts
var SUBAGENT_TOOLS = /* @__PURE__ */ new Set(["Agent", "Task"]);
var RUN_STEP = { id: "run", title: "Run" };
var TODO_OF = { started: "in_progress", done: "completed", failed: "failed", skipped: "skipped" };
var ROW_OF = { started: "running", done: "done", failed: "failed", skipped: "skipped" };
function titleFromSlug(id) {
  const words = id.replace(/[-_.]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}
function flatten(steps, depth = 0, parentId = null, out = []) {
  for (const s of steps) {
    out.push({ id: s.id, title: s.title, depth, parentId });
    if (s.children?.length) flatten(s.children, depth + 1, s.id, out);
  }
  return out;
}
var iso = (ms) => ms === null ? null : new Date(ms).toISOString();
function toGraphInput(events, workflow, live) {
  const planned = workflow?.length ? flatten(workflow) : [];
  const known = new Map(planned.map((p) => [p.id, p]));
  const unplanned = [];
  const reported = events.some((e) => e.t === "step");
  const status = /* @__PURE__ */ new Map();
  const rowState = /* @__PURE__ */ new Map();
  const ensureKnown = (id) => {
    if (known.has(id)) return;
    const p = { id, title: titleFromSlug(id), depth: 0, parentId: null };
    known.set(id, p);
    unplanned.push(p);
  };
  const allSteps = () => [...planned, ...unplanned];
  const todoList = () => allSteps().map((p) => {
    let st = status.get(p.id);
    if (!st) {
      const kids = allSteps().filter((c) => c.parentId === p.id);
      if (kids.some((k) => status.get(k.id) === "in_progress")) st = "in_progress";
    }
    return { id: p.id, content: p.title, status: st ?? "pending", ...rowState.get(p.id)?.note ? { note: rowState.get(p.id).note } : {} };
  });
  const lead = [];
  const calls = /* @__PURE__ */ new Map();
  const topAgent = /* @__PURE__ */ new Map();
  const subagentOf = (agentId) => {
    if (agentId === null) return null;
    const top = topAgent.get(agentId) ?? agentId;
    return calls.get(top) ?? null;
  };
  const push = (agentId, block) => {
    const owner = subagentOf(agentId);
    if (owner) (owner.subagentBlocks ??= []).push(block);
    else lead.push(block);
  };
  let todoSeq = 0;
  if (!workflow?.length && !reported) {
    known.set(RUN_STEP.id, { id: RUN_STEP.id, title: RUN_STEP.title, depth: 0, parentId: null });
    unplanned.push(known.get(RUN_STEP.id));
    const first = events[0]?.at ?? null;
    status.set(RUN_STEP.id, "in_progress");
    rowState.set(RUN_STEP.id, { status: "running", note: null, startedAt: first, finishedAt: null });
    lead.push({ type: "tool_call", toolCall: todoCall(++todoSeq, todoList(), first) });
  }
  for (const e of events) {
    switch (e.t) {
      case "step": {
        ensureKnown(e.stepId);
        status.set(e.stepId, TODO_OF[e.status]);
        const prev = rowState.get(e.stepId);
        rowState.set(e.stepId, {
          status: ROW_OF[e.status],
          note: e.note ?? prev?.note ?? null,
          startedAt: e.status === "started" ? prev?.startedAt ?? e.at : prev?.startedAt ?? null,
          finishedAt: e.status === "started" ? null : e.at
        });
        lead.push({ type: "tool_call", toolCall: todoCall(++todoSeq, todoList(), e.at) });
        break;
      }
      case "text":
        if (e.text.trim()) push(e.agentId, { type: "text", text: e.text });
        break;
      case "tool.start": {
        const isSub = SUBAGENT_TOOLS.has(e.name);
        if (isSub && e.agentId === null) {
          const call2 = {
            toolCallId: e.id,
            toolName: "subagent",
            args: {
              ...typeof e.input.description === "string" ? { description: e.input.description } : {},
              task: typeof e.input.prompt === "string" ? e.input.prompt : ""
            },
            argsPartial: "",
            status: "executing",
            subagentBlocks: [],
            startedAt: e.at
          };
          calls.set(e.id, call2);
          lead.push({ type: "tool_call", toolCall: call2 });
          break;
        }
        if (isSub && e.agentId !== null) topAgent.set(e.id, topAgent.get(e.agentId) ?? e.agentId);
        const call = { toolCallId: e.id, toolName: e.name, args: e.input, argsPartial: "", status: "executing", startedAt: e.at };
        calls.set(e.id, call);
        push(e.agentId, { type: "tool_call", toolCall: call });
        break;
      }
      case "tool.end": {
        const call = calls.get(e.id);
        if (!call) break;
        call.status = e.ok ? "done" : "error";
        call.result = e.result;
        call.endedAt = e.at;
        break;
      }
      default:
        break;
    }
  }
  if (!live && rowState.get(RUN_STEP.id)?.status === "running" && !reported) {
    const last = events.at(-1)?.at ?? null;
    rowState.set(RUN_STEP.id, { status: "done", note: null, startedAt: rowState.get(RUN_STEP.id).startedAt, finishedAt: last });
  }
  const steps = allSteps().map((p) => {
    const r = rowState.get(p.id);
    return { id: p.id, title: p.title, depth: p.depth, status: r?.status ?? "pending", note: r?.note ?? null, startedAt: iso(r?.startedAt ?? null), finishedAt: iso(r?.finishedAt ?? null) };
  });
  const messages = [{ id: "run", role: "assistant", contentBlocks: lead, isStreaming: live }];
  const overviewSteps = workflow?.length ? [...workflow, ...unplanned.map((p) => ({ id: p.id, title: p.title, detail: "", kind: "action" }))] : null;
  return { overviewSteps, steps, messages, live };
}
function todoCall(seq, todos, at) {
  return {
    toolCallId: `runwell-step-${seq}`,
    toolName: "todo_write",
    args: { todos },
    argsPartial: "",
    status: "done",
    ...at !== null ? { startedAt: at, endedAt: at } : {}
  };
}
function graphOf(events, workflow, live) {
  return buildRunGraph(toGraphInput(events, workflow, live));
}

// src/server/claude/auth.ts
import { execFile } from "node:child_process";
import { homedir as homedir3 } from "node:os";

// src/server/claude/locate.ts
import { accessSync, constants as constants2, statSync as statSync2 } from "node:fs";
import { delimiter, join as join3 } from "node:path";
function isExecutable(file) {
  try {
    if (!statSync2(file).isFile()) return false;
    accessSync(file, constants2.X_OK);
    return true;
  } catch {
    return false;
  }
}
function locateClaude(opts) {
  const candidates = [
    ...opts.configured ? [opts.configured] : [],
    ...(opts.env.PATH ?? "").split(delimiter).filter(Boolean).map((d) => join3(d, "claude")),
    join3(opts.home, ".claude/local/claude"),
    join3(opts.home, ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude"
  ];
  return candidates.find(isExecutable) ?? null;
}

// src/server/claude/auth.ts
var NOT_FOUND = "Claude Code was not found. Install it, or set its path in Settings.";
var SIGNED_OUT = "Run `claude` in a terminal and sign in.";
var MODS_FROM = "2.1.287";
function run2(bin, args, env, timeoutMs) {
  return new Promise((resolve3) => {
    execFile(bin, args, { env, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err && err.killed) return resolve3(null);
      const code = err ? err.code ?? 1 : 0;
      resolve3({ code: typeof code === "number" ? code : 1, stdout: String(stdout) });
    });
  });
}
async function claudeVersion(bin, env = process.env, timeoutMs = 5e3) {
  const r = await run2(bin, ["--version"], env, timeoutMs);
  return r ? /(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1] ?? null : null;
}
async function checkSignedIn(bin, env = process.env, timeoutMs = 5e3) {
  const r = await run2(bin, ["auth", "status", "--json"], env, timeoutMs);
  if (!r) return "unknown";
  try {
    const loggedIn = JSON.parse(r.stdout).loggedIn;
    if (r.code === 0 && loggedIn === true) return "in";
    if (loggedIn === false) return "out";
  } catch {
  }
  return "unknown";
}
function isAuthError(text) {
  return text.includes("authentication_failed") || text.trimStart().startsWith("Not logged in");
}
var atLeast = (v, min) => {
  const a = v.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
};
async function claudeState(opts) {
  const env = opts.env ?? process.env;
  const path = locateClaude({ configured: opts.configured, env, home: opts.home ?? homedir3() });
  if (!path) return { found: false, path: null, version: null, signedIn: "unknown", modsSupported: false, message: NOT_FOUND };
  const [version, signedIn] = await Promise.all([claudeVersion(path, env), checkSignedIn(path, env)]);
  return { found: true, path, version, signedIn, modsSupported: version ? atLeast(version, MODS_FROM) : false, message: signedIn === "out" ? SIGNED_OUT : null };
}

// src/server/projects.ts
import { closeSync as closeSync2, existsSync, openSync as openSync2, readFileSync as readFileSync5, readSync, readdirSync as readdirSync2, statSync as statSync3 } from "node:fs";
import { basename, join as join4 } from "node:path";
var HEAD_BYTES = 2 * 1024 * 1024;
var HEAD_LINES = 200;
function cwdOf(file) {
  let fd = null;
  try {
    fd = openSync2(file, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    const lines2 = buf.subarray(0, n).toString("utf8").split("\n").slice(0, HEAD_LINES);
    for (const line of lines2) {
      if (!line.includes('"cwd"')) continue;
      try {
        const v = JSON.parse(line);
        if (typeof v.cwd === "string" && v.cwd.startsWith("/")) return v.cwd;
      } catch {
      }
    }
  } catch {
  } finally {
    if (fd !== null) closeSync2(fd);
  }
  return null;
}
function readTrust(claudeJson) {
  try {
    const raw2 = JSON.parse(readFileSync5(claudeJson, "utf8"));
    const out = /* @__PURE__ */ new Map();
    if (raw2.projects && typeof raw2.projects === "object") {
      for (const [path, v] of Object.entries(raw2.projects)) {
        out.set(path, !!v && typeof v === "object" && v.hasTrustDialogAccepted === true);
      }
    }
    return out;
  } catch {
    return null;
  }
}
function readLogs(claudeHome) {
  const root = join4(claudeHome, "projects");
  let folders;
  try {
    folders = readdirSync2(root);
  } catch {
    return null;
  }
  const out = /* @__PURE__ */ new Map();
  for (const f of folders) {
    const dir = join4(root, f);
    let logs = [];
    try {
      logs = readdirSync2(dir).filter((x) => x.endsWith(".jsonl")).map((x) => ({ file: join4(dir, x), at: statSync3(join4(dir, x)).mtimeMs })).sort((a, b) => b.at - a.at);
    } catch {
      continue;
    }
    const newest = logs[0];
    if (!newest) continue;
    const cwd = cwdOf(newest.file);
    if (cwd && (out.get(cwd) ?? 0) < newest.at) out.set(cwd, Math.round(newest.at));
  }
  return out;
}
function skillCount(path) {
  try {
    return readdirSync2(join4(path, ".claude/skills"), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join4(path, ".claude/skills", d.name, "SKILL.md"))).length;
  } catch {
    return 0;
  }
}
function scanProjects(claudeHome, claudeJson, runwellRoot) {
  const trust = readTrust(claudeJson);
  const logs = readLogs(claudeHome);
  if (!trust && !logs) return { projects: [], readable: false };
  const paths2 = /* @__PURE__ */ new Set([...trust?.keys() ?? [], ...logs?.keys() ?? []]);
  const projects = [];
  for (const path of paths2) {
    if (path.includes("/.claude/worktrees/")) continue;
    if (runwellRoot && isRunwellFolder(path, runwellRoot)) continue;
    try {
      if (!statSync3(path).isDirectory()) continue;
    } catch {
      continue;
    }
    projects.push({ path, name: basename(path), trusted: trust?.get(path) ?? false, lastUsedAt: logs?.get(path) ?? null, skillCount: skillCount(path) });
  }
  projects.sort((a, b) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) || a.name.localeCompare(b.name));
  return { projects, readable: true };
}
function trustOf(projects, path) {
  return projects.find((p) => p.path === path)?.trusted ? "trusted" : "untrusted";
}
function hasHooks(file) {
  try {
    const v = JSON.parse(readFileSync5(file, "utf8"));
    return !!v && typeof v === "object" && "hooks" in v;
  } catch {
    return false;
  }
}
function checkProject(path, projects) {
  let exists = false;
  try {
    exists = statSync3(path).isDirectory();
  } catch {
  }
  if (!exists) return { exists: false, trusted: false, hooks: false, mcp: false };
  return {
    exists,
    trusted: trustOf(projects, path) === "trusted",
    hooks: hasHooks(join4(path, ".claude/settings.json")) || hasHooks(join4(path, ".claude/settings.local.json")),
    mcp: existsSync(join4(path, ".mcp.json"))
  };
}

// src/server/runs.ts
var MAX_BRIEF = 2e4;
var ACTIVE = ["queued", "running", "waiting"];
var B32 = "abcdefghijklmnopqrstuvwxyz234567";
function newRunId() {
  const bytes = randomBytes4(12);
  let s = "";
  for (const b of bytes) s += B32[b & 31];
  return s;
}
var toRow = (r) => ({
  id: r.id,
  skillKey: r.skill_key,
  skillRef: r.skill_ref,
  n: r.n,
  kind: r.kind,
  status: r.status,
  brief: r.brief ?? "",
  cwd: r.cwd ?? "",
  place: r.place ?? "folder",
  projectPath: r.project_path,
  model: r.model,
  allowAll: !!r.allow_all,
  mode: r.mode === "auto" || r.mode === "ask" ? r.mode : null,
  skillVersion: r.skill_version ?? 1,
  createdAt: r.created_at,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  waitingMs: r.waiting_ms ?? 0,
  rating: r.rating === 1 ? 1 : r.rating === -1 ? -1 : null,
  note: r.note,
  error: r.error,
  sessionId: r.session_id ?? null
});
function uniqueName(dir, raw2) {
  const base = basename2(raw2.replace(/\\/g, "/")) || "file";
  const ext2 = extname(base);
  const stem = base.slice(0, base.length - ext2.length) || "file";
  let name = base;
  for (let i = 2; existsSync2(join5(dir, name)); i++) name = `${stem}-${i}${ext2}`;
  return name;
}
function createRunsService(deps) {
  const handles = /* @__PURE__ */ new Map();
  const stopping = /* @__PURE__ */ new Set();
  const openAsks = /* @__PURE__ */ new Map();
  const workflows = /* @__PURE__ */ new Map();
  const launches = /* @__PURE__ */ new Map();
  const row = (id) => {
    const r = deps.db.get("SELECT * FROM runs WHERE id = ?", id);
    return r ? toRow(r) : null;
  };
  const publishRuns = (id) => deps.hub.publish("runs", { id, status: row(id)?.status });
  const append = (id, e) => {
    mkdirSync3(deps.paths.runDir(id), { recursive: true });
    appendFileSync(deps.paths.events(id), JSON.stringify(e) + "\n");
    deps.hub.publish(`run:${id}`, e);
    if (e.t === "ask") {
      const asks = openAsks.get(id) ?? /* @__PURE__ */ new Map();
      asks.set(e.ask.id, e.at);
      openAsks.set(id, asks);
      deps.db.run("UPDATE runs SET status = 'waiting' WHERE id = ? AND status IN ('running', 'waiting')", id);
      publishRuns(id);
    } else if (e.t === "ask.done") {
      const asks = openAsks.get(id);
      const since = asks?.get(e.id);
      asks?.delete(e.id);
      if (since !== void 0) deps.db.run("UPDATE runs SET waiting_ms = COALESCE(waiting_ms, 0) + ? WHERE id = ?", Math.max(0, e.at - since), id);
      if (!asks?.size) deps.db.run("UPDATE runs SET status = 'running' WHERE id = ? AND status = 'waiting'", id);
      publishRuns(id);
    } else if (e.t === "status") {
      deps.db.run("UPDATE runs SET status = ? WHERE id = ?", e.status, id);
      publishRuns(id);
    }
  };
  const events = (id, from = 0) => {
    try {
      return readFileSync6(deps.paths.events(id), "utf8").split("\n").filter((l) => l.trim()).flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      }).slice(from);
    } catch {
      return [];
    }
  };
  const activeCount = () => deps.db.get("SELECT COUNT(*) AS c FROM runs WHERE status IN ('running', 'waiting')")?.c ?? 0;
  async function finish(id, outcome) {
    const status = stopping.has(id) ? "stopped" : outcome.sawOk ? "finished" : "failed";
    const error = status === "failed" ? outcome.error ?? "Claude stopped without finishing" : null;
    stopping.delete(id);
    handles.delete(id);
    deps.onRunEnd(id);
    openAsks.delete(id);
    deps.db.run("UPDATE runs SET ended_at = ?, error = ?, pid = NULL WHERE id = ?", deps.now(), error, id);
    append(id, { t: "status", at: deps.now(), status, reason: error });
    const r = row(id);
    const evs = events(id);
    try {
      await deps.collectOutputs(r, evs);
    } catch {
    }
    try {
      writeFileSync3(deps.paths.workflowJson(id), JSON.stringify(graphOf(evs, workflows.get(id)?.steps ?? null, false)));
    } catch {
    }
    publishRuns(id);
    pump();
  }
  async function launch(id) {
    const r = row(id);
    if (!r) return;
    const skill = deps.skill(r.skillKey);
    const wf = skill ? await deps.workflow(skill).catch(() => ({ steps: null, from: "none", note: null })) : { steps: null, from: "none", note: null };
    workflows.set(id, wf);
    const mcpConfigPath = join5(deps.paths.runDir(id), "mcp.json");
    if (deps.mcpServer) {
      const s = deps.mcpServer();
      writeFileSync3(mcpConfigPath, JSON.stringify({ mcpServers: { runwell: { command: s.command, args: s.args, env: { RUNWELL_HOME: deps.paths.root } } } }));
    } else writeFileSync3(mcpConfigPath, JSON.stringify({ mcpServers: {} }));
    const inputsDir = deps.paths.inputs(id);
    const inputs = existsSync2(inputsDir) ? readdirSync3(inputsDir).map((f) => join5(inputsDir, f)) : [];
    const contextProject = r.place === "folder" ? deps.db.get("SELECT project_path FROM runs WHERE id = ?", id)?.project_path ?? null : null;
    deps.db.run("UPDATE runs SET status = 'running', started_at = ? WHERE id = ?", deps.now(), id);
    append(id, { t: "status", at: deps.now(), status: "running", reason: null });
    let handle;
    try {
      handle = deps.driver.start({
        runId: id,
        runDir: deps.paths.runDir(id),
        cwd: r.cwd,
        skillRef: r.skillRef,
        brief: r.brief,
        inputs,
        editFolder: r.place === "folder" ? r.cwd : null,
        addDir: contextProject,
        model: r.model,
        allowAll: r.allowAll,
        mode: r.mode ?? "ask",
        steps: wf.steps,
        mcpConfigPath
      });
    } catch (err) {
      await finish(id, { sawOk: false, error: `Claude could not be started: ${err.message}`, sawResult: false });
      return;
    }
    handles.set(id, handle);
    deps.db.run("UPDATE runs SET pid = ? WHERE id = ?", handle.pid, id);
    if (stopping.has(id)) void handle.stop();
    let sawOk = false;
    let error = null;
    let sessionSaved = false;
    for await (const e of handle.events) {
      const sid = handle.sessionId?.() ?? null;
      if (!sessionSaved && sid) {
        sessionSaved = true;
        deps.db.run("UPDATE runs SET session_id = ? WHERE id = ?", sid, id);
      }
      append(id, e);
      if (e.t === "result") {
        sawOk = e.ok;
        error = e.error;
      }
    }
    const done = await handle.done;
    await finish(id, { sawOk, error, sawResult: done.sawResult });
  }
  function pump() {
    const free = deps.config().maxRuns - activeCount();
    if (free <= 0) return;
    const queued = deps.db.all("SELECT id FROM runs WHERE status = 'queued' AND kind = 'button' ORDER BY created_at, rowid LIMIT ?", free);
    for (const q of queued) {
      deps.db.run("UPDATE runs SET status = 'running' WHERE id = ? AND status = 'queued'", q.id);
      const p = launch(q.id).finally(() => launches.delete(q.id));
      launches.set(q.id, p);
    }
  }
  function moveUploads(id, uploadIds) {
    const dest = deps.paths.inputs(id);
    mkdirSync3(dest, { recursive: true });
    for (const up of uploadIds) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(up)) continue;
      const dir = join5(deps.paths.runs, "_uploads", up);
      if (!existsSync2(dir)) continue;
      let original = null;
      try {
        original = readFileSync6(join5(dir, ".name"), "utf8");
      } catch {
      }
      for (const f of readdirSync3(dir)) {
        if (f === ".name") continue;
        const src = join5(dir, f);
        if (!statSync4(src).isFile()) continue;
        renameSync3(src, join5(dest, uniqueName(dest, original ?? f)));
      }
      rmSync2(dir, { recursive: true, force: true });
    }
  }
  return {
    async start(input) {
      const skill = deps.skill(input.skillKey);
      if (!skill) return { ok: false, error: "skill_not_found", message: "That skill was not found." };
      const from = input.fromRun ? row(input.fromRun) : null;
      const brief = input.brief.trim() ? input.brief : from?.brief ?? input.brief;
      if (brief.length > MAX_BRIEF) return { ok: false, error: "brief_too_long", message: "The brief is longer than 20,000 characters." };
      const claude = await deps.claude();
      if (!claude.found) return { ok: false, error: "claude_not_found", message: NOT_FOUND };
      if (claude.signedIn === "out") return { ok: false, error: "signed_out", message: SIGNED_OUT };
      let projectPath = null;
      if (input.place.kind === "project") {
        const path = input.place.path;
        let exists = false;
        try {
          exists = statSync4(path).isDirectory();
        } catch {
        }
        if (!exists) return { ok: false, error: "folder_missing", message: "That folder no longer exists." };
        if (trustOf(deps.projects(), path) !== "trusted" && !input.place.confirmedUntrusted) {
          return { ok: false, error: "untrusted_folder", message: "You have not trusted this folder in Claude Code. Confirm to run here anyway." };
        }
        projectPath = path;
      } else projectPath = input.place.contextProject;
      const id = newRunId();
      const n = (deps.db.get("SELECT MAX(n) AS m FROM runs WHERE skill_key = ?", skill.key)?.m ?? 0) + 1;
      const cwd = input.place.kind === "project" ? input.place.path : deps.paths.work(id);
      mkdirSync3(deps.paths.work(id), { recursive: true });
      if (input.place.kind === "project") rmSync2(deps.paths.work(id), { recursive: true, force: true });
      mkdirSync3(deps.paths.inputs(id), { recursive: true });
      moveUploads(id, input.uploadIds);
      if (from && !input.uploadIds.length && existsSync2(deps.paths.inputs(from.id))) {
        cpSync(deps.paths.inputs(from.id), deps.paths.inputs(id), { recursive: true });
      }
      deps.db.run(
        `INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, brief, cwd, place, project_path, model, allow_all, skill_version, created_at, mode)
         VALUES (?, ?, ?, ?, 'button', 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        skill.key,
        skill.ref,
        n,
        brief,
        cwd,
        input.place.kind,
        projectPath,
        input.model,
        input.allowAll ? 1 : 0,
        skill.version,
        deps.now(),
        input.mode ?? "auto"
      );
      publishRuns(id);
      pump();
      return { ok: true, run: row(id) };
    },
    async stop(id) {
      const r = row(id);
      if (!r) return;
      if (r.status === "queued") {
        deps.db.run("UPDATE runs SET ended_at = ? WHERE id = ?", deps.now(), id);
        append(id, { t: "status", at: deps.now(), status: "stopped", reason: null });
        return;
      }
      if (!ACTIVE.includes(r.status)) return;
      stopping.add(id);
      const h = handles.get(id);
      if (h) await h.stop();
    },
    get: row,
    list(q) {
      const where = [];
      const params = [];
      if (q.skillKey) where.push("skill_key = ?"), params.push(q.skillKey);
      if (q.status) where.push("status = ?"), params.push(q.status);
      params.push(Math.min(Math.max(q.limit ?? 100, 1), 1e3));
      return deps.db.all(`SELECT * FROM runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, rowid DESC LIMIT ?`, ...params).map(toRow);
    },
    events,
    append,
    rate(id, rating, note) {
      deps.db.run("UPDATE runs SET rating = ?, note = ? WHERE id = ?", rating, note, id);
      publishRuns(id);
    },
    remove(id) {
      const r = row(id);
      if (!r) return;
      if (ACTIVE.includes(r.status)) throw new Error("A run in progress cannot be deleted. Stop it first.");
      deps.db.tx(() => {
        deps.db.run("DELETE FROM outputs WHERE run_id = ?", id);
        deps.db.run("DELETE FROM runs WHERE id = ?", id);
      });
      rmSync2(deps.paths.runDir(id), { recursive: true, force: true });
      publishRuns(id);
    },
    removeAll(q) {
      const ids = deps.db.all(`SELECT id FROM runs WHERE status NOT IN ('queued', 'running', 'waiting') ${q.skillKey ? "AND skill_key = ?" : ""}`, ...q.skillKey ? [q.skillKey] : []).map((r) => r.id);
      for (const id of ids) this.remove(id);
      return ids.length;
    },
    recoverOrphans() {
      const orphans = deps.db.all("SELECT id, pid FROM runs WHERE status IN ('queued', 'running', 'waiting')");
      for (const o of orphans) {
        const reason = "Runwell restarted during this run";
        deps.db.run("UPDATE runs SET status = 'failed', error = ?, ended_at = ?, pid = NULL WHERE id = ?", reason, deps.now(), o.id);
        append(o.id, { t: "status", at: deps.now(), status: "failed", reason });
        if (o.pid && (deps.pidCommand(o.pid) ?? "").includes(join5(deps.paths.runDir(o.id), "mcp.json"))) {
          try {
            process.kill(process.platform === "win32" ? o.pid : -o.pid, "SIGTERM");
          } catch {
            try {
              process.kill(o.pid, "SIGTERM");
            } catch {
            }
          }
        }
      }
      return orphans.length;
    },
    activeCount,
    async shutdown() {
      deps.config = /* @__PURE__ */ ((orig) => () => ({ ...orig(), maxRuns: 0 }))(deps.config);
      for (const id of launches.keys()) stopping.add(id);
      await Promise.all([...handles.values()].map((h) => h.stop().catch(() => {
      })));
      await Promise.all([...launches.values()].map((p) => p.catch(() => {
      })));
    },
    workflowOf: (id) => workflows.get(id) ?? { steps: null, from: "none", note: null }
  };
}

// src/server/sessions.ts
import { closeSync as closeSync3, existsSync as existsSync3, openSync as openSync3, readFileSync as readFileSync7, readSync as readSync2, readdirSync as readdirSync4 } from "node:fs";
import { basename as basename3, dirname, join as join6 } from "node:path";
var MAX_LINE = 5 * 1024 * 1024;
var MAX_RESULT = 2e4;
var GAP_MS = 30 * 60 * 1e3;
var READ = /* @__PURE__ */ new Set(["user", "assistant", "system"]);
var KNOWN_OTHER = /* @__PURE__ */ new Set([
  "attachment",
  "queue-operation",
  "file-history-snapshot",
  "file-history-delta",
  "api-request-shape",
  "api-request-blob",
  "api-request",
  "last-prompt",
  "session-owner",
  "derived-from",
  "data-flow-records",
  "atis-latch",
  "tools-used",
  "cost-state",
  "summary",
  "progress"
]);
function* lines(file) {
  const fd = openSync3(file, "r");
  const buf = Buffer.alloc(1024 * 1024);
  let carry = [];
  let carryLen = 0;
  let tooLong = false;
  try {
    for (; ; ) {
      const n = readSync2(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      let start = 0;
      for (let i = 0; i < n; i++) {
        if (buf[i] !== 10) continue;
        const piece = buf.subarray(start, i);
        if (!tooLong && carryLen + piece.length <= MAX_LINE) yield Buffer.concat([...carry, piece]).toString("utf8");
        else yield null;
        carry = [];
        carryLen = 0;
        tooLong = false;
        start = i + 1;
      }
      const rest = buf.subarray(start, n);
      if (carryLen + rest.length > MAX_LINE) {
        tooLong = true;
        carry = [];
        carryLen = 0;
      } else if (!tooLong) {
        carry.push(Buffer.from(rest));
        carryLen += rest.length;
      }
    }
    if (tooLong) yield null;
    else if (carryLen) yield Buffer.concat(carry).toString("utf8");
  } finally {
    closeSync3(fd);
  }
}
var textOf = (content) => typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c && typeof c.text === "string" ? c.text : "").join("") : "";
var cut = (s) => s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)}\u2026 (cut)` : s;
var timeOf = (d, fallback) => {
  const t = typeof d.timestamp === "string" ? Date.parse(d.timestamp) : Number.NaN;
  return Number.isFinite(t) ? t : fallback;
};
function mapEntry(d, at, agentId, line, out) {
  const content = d.message?.content;
  if (!Array.isArray(content)) return;
  for (const b of content) {
    if (d.type === "assistant") {
      if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) out.push({ t: "text", at, agentId, text: b.text, line });
      else if (b?.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string" && !b.name.startsWith("mcp__runwell__")) {
        out.push({ t: "tool.start", at, id: b.id, agentId, name: b.name, input: b.input && typeof b.input === "object" ? b.input : {}, line });
      }
    } else if (d.type === "user" && b?.type === "tool_result" && typeof b.tool_use_id === "string") {
      out.push({ t: "tool.end", at, id: b.tool_use_id, ok: b.is_error !== true, result: cut(textOf(b.content)), line });
    }
  }
}
var COMMAND = /<command-name>\/?([^<\s]+)<\/command-name>/;
var ARGS = /<command-args>([\s\S]*?)<\/command-args>/;
function readSessionLog(file) {
  const log = { cwd: null, sessionId: null, events: [], userTurns: [], marks: [], lastLine: 0, skipped: 0 };
  let n = 0;
  let lastAt = 0;
  try {
    for (const raw2 of lines(file)) {
      n++;
      if (raw2 === null) {
        log.skipped++;
        continue;
      }
      if (!raw2.trim()) continue;
      let d;
      try {
        d = JSON.parse(raw2);
      } catch {
        log.skipped++;
        continue;
      }
      const type = typeof d.type === "string" ? d.type : "";
      if (!READ.has(type)) {
        if (!KNOWN_OTHER.has(type)) log.skipped++;
        continue;
      }
      if (!log.cwd && typeof d.cwd === "string") log.cwd = d.cwd;
      if (!log.sessionId && typeof d.sessionId === "string") log.sessionId = d.sessionId;
      const at = timeOf(d, lastAt);
      lastAt = at;
      log.lastLine = n;
      mapEntry(d, at, null, n, log.events);
      if (type === "user" && d.isMeta !== true) {
        const content = d.message?.content;
        const isToolResult = Array.isArray(content) && content.some((b) => b?.type === "tool_result");
        if (!isToolResult) {
          const text = textOf(content);
          const cmd = COMMAND.exec(text);
          if (cmd) log.marks.push({ line: n, at, skillRef: cmd[1], brief: (ARGS.exec(text)?.[1] ?? "").trim() });
          if (text.trim()) log.userTurns.push({ at, line: n, text });
        }
      }
      if (type === "assistant") {
        const content = d.message?.content;
        for (const b of Array.isArray(content) ? content : []) {
          if (b?.type !== "tool_use" || b.name !== "Skill") continue;
          const input = b.input ?? {};
          const ref = [input.skill, input.command, input.name].find((x) => typeof x === "string" && !!x);
          if (ref) log.marks.push({ line: n, at, skillRef: ref.replace(/^\//, ""), brief: typeof input.args === "string" && input.args.trim() ? input.args.trim() : null });
        }
      }
    }
  } catch {
  }
  if (!log.sessionId) log.sessionId = basename3(file, ".jsonl");
  addSubagents(file, log);
  return log;
}
function addSubagents(file, log) {
  const dir = join6(dirname(file), basename3(file, ".jsonl"), "subagents");
  if (!existsSync3(dir)) return;
  const callLine = /* @__PURE__ */ new Map();
  for (const e of log.events) if (e.t === "tool.start" && SUBAGENT_TOOLS.has(e.name)) callLine.set(e.id, e.line);
  const metas = [];
  for (const f of readdirSync4(dir)) {
    if (!f.endsWith(".meta.json")) continue;
    try {
      const m = JSON.parse(readFileSync7(join6(dir, f), "utf8"));
      if (typeof m.toolUseId === "string") metas.push({ file: join6(dir, f.replace(/\.meta\.json$/, ".jsonl")), toolUseId: m.toolUseId, depth: typeof m.spawnDepth === "number" ? m.spawnDepth : 1 });
    } catch {
    }
  }
  const topOf = /* @__PURE__ */ new Map();
  for (const m of metas.sort((a, b) => a.depth - b.depth)) {
    const top = topOf.get(m.toolUseId) ?? m.toolUseId;
    const line = callLine.get(top) ?? callLine.get(m.toolUseId);
    if (line === void 0 || !existsSync3(m.file)) continue;
    const inner = [];
    let lastAt = 0;
    for (const raw2 of lines(m.file)) {
      if (raw2 === null || !raw2.trim()) continue;
      try {
        const d = JSON.parse(raw2);
        if (!READ.has(String(d.type))) continue;
        const at = timeOf(d, lastAt);
        lastAt = at;
        mapEntry(d, at, top, line, inner);
      } catch {
        log.skipped++;
      }
    }
    for (const e of inner) {
      if (e.t === "tool.start" && SUBAGENT_TOOLS.has(e.name)) {
        topOf.set(e.id, top);
        callLine.set(e.id, line);
      }
    }
    log.events.push(...inner);
  }
  log.events.sort((a, b) => a.line - b.line || a.at - b.at);
}
function findSkillUses(log) {
  const marks = [...log.marks].sort((a, b) => a.line - b.line);
  const lastEventBefore = (line) => {
    let at = 0;
    for (const e of log.events) if (e.line < line && e.at > at) at = e.at;
    for (const u of log.userTurns) if (u.line < line && u.at > at) at = u.at;
    return at;
  };
  return marks.map((m, i) => {
    const nextStart = marks[i + 1]?.line ?? Number.POSITIVE_INFINITY;
    let end = Math.min(nextStart - 1, log.lastLine);
    for (const u of log.userTurns) {
      if (u.line <= m.line || u.line > end) continue;
      const otherCommand = COMMAND.exec(u.text);
      const unrelated = otherCommand && otherCommand[1] !== m.skillRef || u.at - lastEventBefore(u.line) > GAP_MS;
      if (unrelated) {
        end = u.line - 1;
        break;
      }
    }
    const brief = m.brief ?? [...log.userTurns].reverse().find((u) => u.line < m.line)?.text ?? "";
    const inRange = log.events.filter((e) => e.line >= m.line && e.line <= end);
    return {
      skillRef: m.skillRef,
      brief: brief.trim().slice(0, 2e3),
      startLine: m.line,
      endLine: end,
      startedAt: m.at,
      endedAt: inRange.reduce((x, e) => Math.max(x, e.at), m.at)
    };
  });
}

// src/server/backfill.ts
var WRITE_TOOLS2 = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var DAY = 864e5;
function listLogs(claudeHome, sinceMs) {
  const root = join7(claudeHome, "projects");
  const out = [];
  let folders = [];
  try {
    folders = readdirSync5(root);
  } catch {
    return out;
  }
  for (const f of folders) {
    let names = [];
    try {
      names = readdirSync5(join7(root, f));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join7(root, f, name);
      try {
        const st = statSync5(file);
        if (st.isFile() && st.mtimeMs >= sinceMs) out.push({ file, size: st.size, mtime: Math.round(st.mtimeMs) });
      } catch {
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
function createBackfill(deps) {
  let st = { status: "idle", filesDone: 0, filesTotal: 0, runsFound: 0, skippedLines: 0 };
  let cancelled = false;
  let running = null;
  let lastPublish = 0;
  const publish = (force = false) => {
    if (!force && deps.now() - lastPublish < 1e3) return;
    lastPublish = deps.now();
    deps.hub.publish("backfill", st);
  };
  function recordOutputs(runId, events, cwd) {
    const cfg = deps.config();
    let copied = 0;
    const seen = /* @__PURE__ */ new Set();
    for (const e of events) {
      if (e.t !== "tool.start" || !WRITE_TOOLS2.has(e.name)) continue;
      const raw2 = e.input.file_path ?? e.input.notebook_path;
      if (typeof raw2 !== "string" || !isAbsolute2(raw2) || !cwd) continue;
      const abs = resolve2(raw2);
      const rel = relative2(cwd, abs);
      if (!rel || rel.startsWith("..") || isAbsolute2(rel) || seen.has(abs)) continue;
      seen.add(abs);
      let s;
      try {
        s = lstatSync2(abs);
      } catch {
        continue;
      }
      if (!s.isFile() || s.size > cfg.copyFileCapBytes || copied + s.size > cfg.copyRunCapBytes) continue;
      try {
        const root = deps.paths.outputs(runId);
        const dest = join7(root, rel);
        if (!dest.startsWith(root + sep2)) continue;
        mkdirSync4(join7(dest, ".."), { recursive: true });
        copyFileSync2(abs, dest);
        copied += s.size;
        deps.db.run(
          "INSERT OR REPLACE INTO outputs (run_id, path, label, kind, bytes, mtime, copied, hash) VALUES (?, ?, 'history', ?, ?, ?, 1, NULL)",
          runId,
          rel,
          outputKind(rel),
          s.size,
          Math.round(s.mtimeMs)
        );
      } catch {
      }
    }
    if (!events.length) return;
    const ats = events.map((e) => e.at);
    const window = { from: Math.min(...ats) - 2e3, to: Math.max(...ats) + 6e4 };
    for (const f of pointedFiles(events, window, [cwd ?? "", deps.paths.root].filter(Boolean), homedir4())) {
      let s;
      try {
        s = lstatSync2(f.abs);
      } catch {
        continue;
      }
      if (!s.isFile() || s.size > cfg.copyFileCapBytes || copied + s.size > cfg.copyRunCapBytes) continue;
      try {
        const dest = join7(deps.paths.outputs(runId), f.rel);
        mkdirSync4(join7(dest, ".."), { recursive: true });
        copyFileSync2(f.abs, dest);
        copied += s.size;
        deps.db.run(
          "INSERT OR REPLACE INTO outputs (run_id, path, label, kind, bytes, mtime, copied, hash) VALUES (?, ?, 'history', ?, ?, ?, 1, NULL)",
          runId,
          f.rel,
          outputKind(f.rel),
          s.size,
          Math.round(s.mtimeMs)
        );
      } catch {
      }
    }
  }
  function importFile(file) {
    const log = readSessionLog(file);
    st.skippedLines += log.skipped;
    if (log.cwd && isRunwellFolder(log.cwd, deps.paths.root)) return 0;
    const ignored = deps.config().ignored;
    let found = 0;
    for (const use of findSkillUses(log)) {
      if (isIgnored(use.skillRef, ignored, deps.marketplaceOf?.(use.skillRef) ?? null)) continue;
      const sourceRef = `${file}:${use.startLine}-${use.endLine}`;
      const existing = deps.db.get("SELECT id, source_ref FROM runs WHERE kind = 'history' AND (source_ref = ? OR source_ref LIKE ?)", sourceRef, `${file}:${use.startLine}-%`);
      if (existing?.source_ref === sourceRef) continue;
      if (existing) {
        const events2 = log.events.filter((e) => e.line >= use.startLine && e.line <= use.endLine).map(({ line: _line, ...e }) => e);
        events2.push({ t: "status", at: use.endedAt, status: "finished", reason: null });
        writeFileSync4(deps.paths.events(existing.id), events2.map((e) => JSON.stringify(e)).join("\n") + "\n");
        deps.db.run("UPDATE runs SET ended_at = ?, source_ref = ? WHERE id = ?", use.endedAt, sourceRef, existing.id);
        recordOutputs(existing.id, events2, log.cwd);
        continue;
      }
      const id = newRunId();
      const skillKey = deps.skillKeyOf(use.skillRef) ?? `unknown:${use.skillRef}`;
      const n = (deps.db.get("SELECT MAX(n) AS m FROM runs WHERE skill_key = ?", skillKey)?.m ?? 0) + 1;
      const events = log.events.filter((e) => e.line >= use.startLine && e.line <= use.endLine).map(({ line: _line, ...e }) => e);
      events.push({ t: "status", at: use.endedAt, status: "finished", reason: null });
      mkdirSync4(deps.paths.runDir(id), { recursive: true });
      writeFileSync4(deps.paths.events(id), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
      deps.db.run(
        `INSERT INTO runs (id, skill_key, skill_ref, n, kind, status, brief, cwd, place, project_path, created_at, started_at, ended_at, source_ref, session_id)
         VALUES (?, ?, ?, ?, 'history', 'finished', ?, ?, 'chat', ?, ?, ?, ?, ?, ?)`,
        id,
        skillKey,
        use.skillRef,
        n,
        use.brief,
        log.cwd,
        log.cwd,
        use.startedAt,
        use.startedAt,
        use.endedAt,
        sourceRef,
        log.sessionId
      );
      recordOutputs(id, events, log.cwd);
      found++;
    }
    return found;
  }
  function fillSessionIds() {
    const rows = deps.db.all("SELECT id, source_ref FROM runs WHERE kind = 'history' AND session_id IS NULL AND source_ref IS NOT NULL");
    for (const r of rows) {
      const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl:\d+-\d+$/i.exec(r.source_ref);
      if (m) deps.db.run("UPDATE runs SET session_id = ? WHERE id = ?", m[1], r.id);
    }
  }
  async function run3() {
    fillSessionIds();
    const cfg = deps.config();
    const claudeHome = cfg.claudeHome ?? join7(homedir4(), ".claude");
    const files = listLogs(claudeHome, deps.now() - cfg.backfillDays * DAY);
    st = { status: "running", filesDone: 0, filesTotal: files.length, runsFound: 0, skippedLines: 0 };
    publish(true);
    for (const f of files) {
      if (cancelled) break;
      const known = deps.db.get("SELECT size, mtime FROM backfill_files WHERE path = ?", f.file);
      if (!known || known.size !== f.size || known.mtime !== f.mtime) {
        try {
          st.runsFound += importFile(f.file);
          deps.db.run(
            "INSERT OR REPLACE INTO backfill_files (path, size, mtime, done_at, skipped_lines) VALUES (?, ?, ?, ?, ?)",
            f.file,
            f.size,
            f.mtime,
            deps.now(),
            st.skippedLines
          );
        } catch {
        }
      }
      st.filesDone++;
      publish();
      await new Promise((r) => setImmediate(r));
    }
    st.status = "done";
    publish(true);
    deps.hub.publish("runs", { backfill: true });
  }
  return {
    start() {
      if (running) return;
      cancelled = false;
      running = run3().finally(() => running = null);
    },
    async stop() {
      cancelled = true;
      await running;
    },
    state: () => ({ ...st })
  };
}

// src/server/claude/driver.ts
import { spawn } from "node:child_process";
import { writeFileSync as writeFileSync5 } from "node:fs";
import { join as join8 } from "node:path";
import { createInterface } from "node:readline";

// src/server/claude/decisions.ts
var DECISIONS = {
  askRoute: "permission-tool",
  skillInvocation: (ref, brief) => `/${ref}${brief.trim() ? ` ${brief.trim()}` : ""}`,
  folderRule: (folder) => ({ permissions: { allow: [`Edit(/${folder.replace(/\/+$/, "")}/**)`] } }),
  bypassFlag: ["--permission-mode", "bypassPermissions"],
  autoFlag: ["--permission-mode", "auto"],
  stopSignal: "SIGINT",
  toolTimeoutEnv: { MCP_TOOL_TIMEOUT: String(24 * 60 * 60 * 1e3) }
};

// src/server/claude/normalise.ts
var MAX_RESULT2 = 2e4;
var HIDDEN_TOOLS = /* @__PURE__ */ new Set(["mcp__runwell__runwell_step", "mcp__runwell__runwell_permission"]);
var KNOWN_TYPES = /* @__PURE__ */ new Set(["assistant", "user", "result", "system", "rate_limit_event", "stream_event"]);
function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c && typeof c === "object" && typeof c.text === "string" ? c.text : "").join("");
  return content === void 0 || content === null ? "" : JSON.stringify(content);
}
var cut2 = (s) => s.length > MAX_RESULT2 ? `${s.slice(0, MAX_RESULT2)}\u2026 (cut)` : s;
function createNormaliser(now) {
  let skipped = 0;
  let session = null;
  const open = /* @__PURE__ */ new Set();
  const hidden = /* @__PURE__ */ new Set();
  const topOf = /* @__PURE__ */ new Map();
  const timeOf2 = (d) => {
    const t = typeof d.timestamp === "string" ? Date.parse(d.timestamp) : Number.NaN;
    return Number.isFinite(t) ? t : now();
  };
  const agentOf = (parent) => typeof parent === "string" && parent ? topOf.get(parent) ?? parent : null;
  function push(raw2) {
    const line = raw2.replace(/\r$/, "");
    if (!line.trim()) return [];
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      skipped++;
      return [];
    }
    if (!d || typeof d !== "object" || typeof d.type !== "string" || !KNOWN_TYPES.has(d.type)) {
      skipped++;
      return [];
    }
    if (typeof d.session_id === "string" && !session) session = d.session_id;
    const out = [];
    const at = timeOf2(d);
    const agentId = agentOf(d.parent_tool_use_id);
    const content = d.message?.content ?? [];
    if (d.type === "assistant" && Array.isArray(content)) {
      if (typeof d.error === "string" && isAuthError(d.error)) return [];
      for (const b of content) {
        if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) out.push({ t: "text", at, agentId, text: b.text });
        else if (b?.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
          if (HIDDEN_TOOLS.has(b.name)) {
            hidden.add(b.id);
            continue;
          }
          if (SUBAGENT_TOOLS.has(b.name) && agentId !== null) topOf.set(b.id, agentId);
          open.add(b.id);
          out.push({ t: "tool.start", at, id: b.id, agentId, name: b.name, input: b.input && typeof b.input === "object" ? b.input : {} });
        }
      }
    } else if (d.type === "user" && Array.isArray(content)) {
      for (const b of content) {
        if (b?.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
        if (hidden.delete(b.tool_use_id)) continue;
        if (!open.delete(b.tool_use_id)) continue;
        out.push({ t: "tool.end", at, id: b.tool_use_id, ok: b.is_error !== true, result: cut2(resultText(b.content)) });
      }
    } else if (d.type === "result") {
      const isError = d.is_error === true;
      const text = typeof d.result === "string" ? d.result : "";
      const error = !isError ? null : isAuthError(text) ? SIGNED_OUT : text || (typeof d.subtype === "string" ? d.subtype : "The run failed");
      out.push({ t: "result", at, ok: !isError, error });
    }
    return out;
  }
  return {
    push,
    end() {
      const at = now();
      const out = [...open].map((id) => ({ t: "tool.end", at, id, ok: false, result: "The run ended before this finished" }));
      open.clear();
      return out;
    },
    skipped: () => skipped,
    sessionId: () => session
  };
}

// src/server/claude/driver.ts
function killGroup(child, sig) {
  try {
    if (child.pid && process.platform !== "win32") process.kill(-child.pid, sig);
    else child.kill(sig);
  } catch {
    child.kill(sig);
  }
}
var flatSteps = (steps, out = []) => {
  for (const s of steps) {
    out.push(s);
    if (s.children?.length) flatSteps(s.children, out);
  }
  return out;
};
function systemPrompt(spec) {
  const head = [`Run id: ${spec.runId}`, `This run is shown live in Runwell. Report progress with the runwell_step tool, passing runId "${spec.runId}".`];
  if (!spec.steps?.length) {
    return [
      ...head,
      'Name your own steps: call runwell_step with a short id you choose (for example "gather-sources") and status "started" when you begin each one, and "done", "failed" or "skipped" when it ends.'
    ].join("\n");
  }
  return [
    ...head,
    "Steps:",
    ...flatSteps(spec.steps).map((s) => `- ${s.id}: ${s.title}`),
    'Call runwell_step with status "started" when you begin a step and "done", "failed" or "skipped" when it ends. Start a loop step again each time you repeat it. If you do work that is not in the list, report it under a short id of your own.'
  ].join("\n");
}
function firstMessage(spec, d) {
  const head = d.skillInvocation(spec.skillRef, spec.brief);
  return spec.inputs.length ? `${head}

Attached files:
${spec.inputs.join("\n")}` : head;
}
function buildArgv(spec, d) {
  const argv = [
    "-p",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    systemPrompt(spec),
    "--mcp-config",
    spec.mcpConfigPath,
    "--allowedTools",
    "mcp__runwell__runwell_step"
  ];
  if (spec.addDir) argv.push("--add-dir", spec.addDir);
  if (spec.model) argv.push("--model", spec.model);
  if (spec.editFolder) {
    const file = join8(spec.runDir, "settings.json");
    writeFileSync5(file, JSON.stringify(d.folderRule(spec.editFolder)));
    argv.push("--settings", file);
  }
  if (spec.allowAll) argv.push(...d.bypassFlag);
  else if (spec.mode === "auto") argv.push(...d.autoFlag);
  if (!spec.allowAll && (d.askRoute === "permission-tool" || d.askRoute === "mixed")) argv.push("--permission-prompt-tool", "mcp__runwell__runwell_permission");
  return argv;
}
function eventQueue() {
  const items = [];
  let ended = false;
  let wake = null;
  return {
    push(e) {
      items.push(e);
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      for (; ; ) {
        if (items.length) {
          yield items.shift();
          continue;
        }
        if (ended) return;
        await new Promise((r) => wake = r);
        wake = null;
      }
    }
  };
}
function createClaudeDriver(opts) {
  const d = opts.decisions ?? DECISIONS;
  const grace = opts.graceMs ?? 5e3;
  const now = opts.now ?? Date.now;
  return {
    start(spec) {
      const argv = buildArgv(spec, d);
      const child = spawn(opts.bin, argv, {
        cwd: spec.cwd,
        env: { ...process.env, ...opts.extraEnv, ...d.toolTimeoutEnv, RUNWELL_RUN_ID: spec.runId, RUNWELL_HOME: opts.home },
        stdio: ["pipe", "pipe", "pipe"],
        // Its own process group, so a stop that has to force it also ends what it started (Bash children,
        // the MCP server). Not on Windows, where a detached child gets its own console window.
        detached: process.platform !== "win32"
      });
      const queue = eventQueue();
      const norm = createNormaliser(now);
      let sawResult = false;
      child.stdin.on("error", () => {
      });
      child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: firstMessage(spec, d) }] } }) + "\n");
      child.stderr.resume();
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        for (const e of norm.push(line)) {
          queue.push(e);
          if (e.t === "result") {
            sawResult = true;
            child.stdin.end();
          }
        }
      });
      const done = new Promise((resolve3) => {
        let exitCode = null;
        let closed = 0;
        const finish = () => {
          if (++closed < 2) return;
          for (const e of norm.end()) queue.push(e);
          queue.end();
          resolve3({ exitCode, sawResult, skippedLines: norm.skipped() });
        };
        child.on("exit", (code) => {
          exitCode = code;
          finish();
        });
        rl.on("close", finish);
        child.on("error", () => {
          exitCode = null;
          closed = 1;
          finish();
        });
      });
      let stopping = null;
      const stop = () => stopping ??= (async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill(d.stopSignal);
        const exited = new Promise((r) => child.once("exit", () => r()));
        const after = (ms) => new Promise((r) => setTimeout(() => r("timeout"), ms));
        if (await Promise.race([exited, after(grace)]) === "timeout") {
          killGroup(child, "SIGTERM");
          if (await Promise.race([exited, after(2e3)]) === "timeout") killGroup(child, "SIGKILL");
        }
        await exited;
      })();
      return { pid: child.pid ?? 0, events: queue, sessionId: () => norm.sessionId(), stop, done };
    },
    answer() {
    },
    decide() {
    }
  };
}

// src/server/routes/asks.ts
var LIVE = ["running", "waiting"];
function parseAsk(v) {
  if (!v || typeof v !== "object") return null;
  const a = v;
  const toolCallId = typeof a.toolCallId === "string" ? a.toolCallId : null;
  const agentId = typeof a.agentId === "string" ? a.agentId : null;
  if (a.kind === "permission" && typeof a.tool === "string") {
    return { kind: "permission", toolCallId, agentId, tool: a.tool, input: a.input && typeof a.input === "object" ? a.input : {} };
  }
  if (a.kind === "question" && Array.isArray(a.questions)) return { kind: "question", toolCallId, agentId, questions: a.questions };
  return null;
}
function asksRoutes(broker, runs) {
  return (app, _ctx) => {
    app.post("/api/runs/:id/asks", async (c) => {
      if (c.get("via") !== "bearer") return c.text("Unauthorized", 401);
      const run3 = runs.get(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      if (!LIVE.includes(run3.status)) return c.json({ error: "This run has ended." }, 409);
      let body = null;
      try {
        body = await c.req.json();
      } catch {
      }
      const ask = parseAsk(body);
      if (!ask) return c.json({ error: "Not an ask." }, 400);
      const { answer } = broker.open(run3.id, ask);
      return c.json({ answer: await answer });
    });
    app.get("/api/runs/:id/asks", (c) => c.json({ asks: broker.pending(c.req.param("id")) }));
    app.post("/api/runs/:id/asks/:askId/answer", async (c) => {
      let body = null;
      try {
        body = await c.req.json();
      } catch {
      }
      const a = parseAnswer(body);
      if (!a) return c.json({ error: "Not an answer." }, 400);
      const r = broker.answer(c.req.param("id"), c.req.param("askId"), a);
      if (r === "gone") return c.json({ error: "This card was already answered, or its run has ended." }, 409);
      if (r === "mismatch") return c.json({ error: "That answer is for a different kind of card." }, 400);
      return c.json({ ok: true });
    });
  };
}

// src/server/routes/backfill.ts
function backfillRoutes(backfill) {
  return (app, _ctx) => {
    app.get("/api/backfill", (c) => c.json(backfill.state()));
    app.post("/api/backfill/rescan", (c) => {
      backfill.start();
      return c.json(backfill.state());
    });
  };
}

// src/server/routes/claude.ts
function claudeRoutes(state) {
  return (app, ctx) => {
    let cached = null;
    app.get("/api/claude", async (c) => {
      if (!cached || c.req.query("fresh") === "1" || ctx.now() - cached.at > 3e4) {
        cached = { at: ctx.now(), state: await state() };
      }
      return c.json(cached.state);
    });
  };
}

// src/server/routes/outputs.ts
import { createReadStream, statSync as statSync6 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { isAbsolute as isAbsolute3, join as join9 } from "node:path";
import { Readable as Readable2 } from "node:stream";
function runFolder(run3) {
  const dir = run3.place === "folder" ? run3.cwd : run3.projectPath ?? run3.cwd;
  try {
    return dir && statSync6(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}
function outputsRoutes(outputs, runOf, eventsOf = () => []) {
  return (app, _ctx) => {
    app.get("/o/:grant/:runId/*", (c) => {
      const runId = c.req.param("runId");
      const run3 = runOf(runId);
      if (!run3 || !outputs.checkGrant(runId, c.req.param("grant"))) return c.text("Not found", 404);
      const prefix = `/o/${c.req.param("grant")}/${runId}/`;
      const rel = decodeURIComponent(new URL(c.req.url).pathname.slice(prefix.length));
      const file = outputs.file(run3, rel);
      if (!file) return c.text("Not found", 404);
      const size = statSync6(file).size;
      const type = mimeOf(file);
      const headers = {
        "Content-Type": type,
        ...type === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox allow-scripts" },
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store"
      };
      const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
      if (range && size > 0) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start > end || start >= size) return c.body(null, 416, { "Content-Range": `bytes */${size}` });
        const body = Readable2.toWeb(createReadStream(file, { start, end }));
        return c.body(body, 206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) });
      }
      return c.body(Readable2.toWeb(createReadStream(file)), 200, { ...headers, "Content-Length": String(size) });
    });
    app.get("/api/runs/:id/outputs", (c) => {
      const id = c.req.param("id");
      const run3 = runOf(id);
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      const where = (rel) => rel.startsWith("~/") ? join9(homedir5(), rel.slice(2)) : isAbsolute3(rel) ? rel : join9(run3.place === "folder" ? run3.cwd : run3.projectPath ?? run3.cwd, rel);
      return c.json({ outputs: outputs.list(id).map((o) => ({ ...o, absolute: where(o.path) })), grant: outputs.grant(id) });
    });
    app.get("/api/outputs", (c) => {
      const before = Number(c.req.query("before"));
      const limit = Number(c.req.query("limit"));
      const items = outputs.recent({ skill: c.req.query("skill") || void 0, kind: c.req.query("kind") || void 0, before: Number.isFinite(before) && before > 0 ? before : void 0, limit: Number.isFinite(limit) && limit > 0 ? limit : void 0 });
      return c.json({ items: items.map((i) => ({ ...i, grant: outputs.grant(i.runId) })) });
    });
    app.post("/api/runs/:id/outputs/rescan", async (c) => {
      const run3 = runOf(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      if (["queued", "running", "waiting"].includes(run3.status)) return c.json({ error: "This run is still going." }, 409);
      await outputs.collect(run3, eventsOf(run3.id));
      return c.json({ outputs: outputs.list(run3.id).length });
    });
    app.post("/api/runs/:id/reveal", (c) => {
      const run3 = runOf(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      const dir = runFolder(run3);
      if (!dir) return c.json({ error: "This run's folder no longer exists." }, 404);
      outputs.reveal(dir);
      return c.json({ ok: true, path: dir });
    });
    app.post("/api/outputs/reveal", async (c) => {
      let body = {};
      try {
        body = await c.req.json();
      } catch {
      }
      const run3 = typeof body.runId === "string" ? runOf(body.runId) : null;
      const file = run3 && typeof body.path === "string" ? outputs.file(run3, body.path) : null;
      if (!file) return c.json({ error: "No such output." }, 404);
      outputs.reveal(file);
      return c.body(null, 204);
    });
  };
}

// src/server/routes/projects.ts
import { homedir as homedir6 } from "node:os";
import { join as join10 } from "node:path";
function projectsRoutes(app, ctx) {
  const scan = () => {
    const claudeHome = ctx.config().claudeHome ?? join10(homedir6(), ".claude");
    return scanProjects(claudeHome, join10(claudeHome, "..", ".claude.json"), ctx.paths.root);
  };
  app.get("/api/projects", (c) => c.json(scan()));
  app.post("/api/projects/check", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
    }
    if (typeof body.path !== "string" || !body.path.startsWith("/")) return c.json({ error: 'Send { path: "/absolute/folder" }.' }, 400);
    return c.json(checkProject(body.path, scan().projects));
  });
}

// src/server/continue.ts
import { spawn as spawn2, spawnSync } from "node:child_process";
import { existsSync as existsSync4 } from "node:fs";
import { homedir as homedir7 } from "node:os";
var SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
var systemLaunch = {
  detached: (cmd, args, cwd) => new Promise((resolve3) => {
    try {
      const c = spawn2(cmd, args, { cwd, detached: true, stdio: "ignore" });
      c.once("error", () => resolve3(false));
      c.once("spawn", () => (c.unref(), resolve3(true)));
    } catch {
      resolve3(false);
    }
  }),
  run: (cmd, args, cwd, timeoutMs) => new Promise((resolve3) => {
    let out = "";
    const c = spawn2(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    c.stdout.on("data", (d) => out += d);
    c.stderr.on("data", (d) => out += d);
    c.once("error", () => resolve3({ code: null, out }));
    c.once("close", (code) => resolve3({ code, out }));
  }),
  has: (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0,
  platform: process.platform
};
function resumeInfo(run3, platform2) {
  if (!run3.sessionId || !SESSION_ID.test(run3.sessionId)) return null;
  const cwd = run3.cwd && existsSync4(run3.cwd) ? run3.cwd : null;
  const available = platform2 === "darwin" || platform2 === "win32";
  return {
    sessionId: run3.sessionId,
    command: `${cwd ? `cd ${shq(cwd)} && ` : ""}claude --resume ${run3.sessionId}`,
    desktop: { available, reason: available ? null : "Claude Code opens a session in Claude Desktop on macOS and Windows only." }
  };
}
var TERMINALS = [
  { bin: "x-terminal-emulator", args: (_c, line) => ["-e", "sh", "-c", line] },
  { bin: "gnome-terminal", args: (cwd, _l, argv) => [`--working-directory=${cwd}`, "--", ...argv] },
  { bin: "konsole", args: (cwd, _l, argv) => ["--workdir", cwd, "-e", ...argv] },
  { bin: "xfce4-terminal", args: (cwd, _l, argv) => ["--working-directory", cwd, "-x", ...argv] },
  { bin: "kitty", args: (cwd, _l, argv) => ["--directory", cwd, ...argv] },
  { bin: "alacritty", args: (cwd, _l, argv) => ["--working-directory", cwd, "-e", ...argv] },
  { bin: "xterm", args: (_c, line) => ["-e", "sh", "-c", line] }
];
var plain2 = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim();
async function continueRun(run3, where, claudeBin, launch) {
  if (["queued", "running", "waiting"].includes(run3.status)) return { ok: false, status: 409, message: "This run is still going. Continue it once it has ended." };
  const info = resumeInfo(run3, launch.platform);
  if (!info) return { ok: false, status: 409, message: "This run has no Claude session to continue." };
  const cwd = run3.cwd && existsSync4(run3.cwd) ? run3.cwd : homedir7();
  const argv = [claudeBin, "--resume", info.sessionId];
  if (where === "desktop") {
    if (!info.desktop.available) return { ok: false, status: 400, message: info.desktop.reason };
    const r = launch.platform === "darwin" ? await launch.run("script", ["-q", "/dev/null", claudeBin, "--desktop", "--resume", info.sessionId], cwd, 3e4) : await launch.run(claudeBin, ["--desktop", "--resume", info.sessionId], cwd, 3e4);
    return r.code === 0 ? { ok: true, message: "Opened in Claude Desktop." } : { ok: false, status: 502, message: plain2(r.out).split("\n")[0] || "Claude Desktop could not open this session." };
  }
  const line = `cd ${shq(cwd)} && ${shq(claudeBin)} --resume ${info.sessionId}`;
  if (launch.platform === "darwin") {
    const script = line.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const ok = await launch.detached("osascript", ["-e", `tell application "Terminal" to do script "${script}"`, "-e", 'tell application "Terminal" to activate'], cwd);
    if (ok) return { ok: true, message: "Opened in Terminal." };
  } else if (launch.platform !== "win32") {
    for (const t of TERMINALS) {
      if (!launch.has(t.bin)) continue;
      if (await launch.detached(t.bin, t.args(cwd, line, argv), cwd)) return { ok: true, message: "Opened in a terminal." };
    }
  }
  return { ok: false, status: 501, message: "No terminal could be opened. Copy the command and run it in your own terminal." };
}

// src/server/routes/runs.ts
var STATUSES = /* @__PURE__ */ new Set(["queued", "running", "waiting", "finished", "failed", "stopped"]);
var ENDED = /* @__PURE__ */ new Set(["finished", "failed", "stopped"]);
var CONFLICT = ["signed_out", "claude_not_found", "untrusted_folder"];
function parsePlace(v) {
  if (!v || typeof v !== "object") return null;
  const p = v;
  if (p.kind === "folder") return { kind: "folder", contextProject: typeof p.contextProject === "string" ? p.contextProject : null };
  if (p.kind === "project" && typeof p.path === "string") return { kind: "project", path: p.path, confirmedUntrusted: p.confirmedUntrusted === true };
  return null;
}
function parseStart(v) {
  if (!v || typeof v !== "object") return null;
  const b = v;
  const place = parsePlace(b.place ?? { kind: "folder" });
  if (typeof b.skillKey !== "string" || !place) return null;
  return {
    skillKey: b.skillKey,
    brief: typeof b.brief === "string" ? b.brief : "",
    place,
    model: typeof b.model === "string" && b.model ? b.model : null,
    allowAll: b.allowAll === true,
    mode: b.mode === "ask" ? "ask" : "auto",
    uploadIds: Array.isArray(b.uploadIds) ? b.uploadIds.filter((x) => typeof x === "string") : [],
    fromRun: typeof b.fromRun === "string" ? b.fromRun : null
  };
}
function runsRoutes(s) {
  return (app, ctx) => {
    app.post("/api/runs", async (c) => {
      let body = null;
      try {
        body = await c.req.json();
      } catch {
      }
      const input = parseStart(body);
      if (!input) return c.json({ error: "bad_request", message: "Send a skillKey, a brief and a place." }, 400);
      const r = await s.runs.start(input);
      if (!r.ok) return c.json({ error: r.error, message: r.message }, CONFLICT.includes(r.error) ? 409 : 400);
      return c.json({ run: r.run }, 201);
    });
    app.get("/api/runs", (c) => {
      const status = c.req.query("status");
      const limit = Number(c.req.query("limit"));
      return c.json({ runs: s.runs.list({ skillKey: c.req.query("skill") || void 0, status: status && STATUSES.has(status) ? status : void 0, limit: Number.isFinite(limit) && limit > 0 ? limit : void 0 }) });
    });
    app.get("/api/runs/latest", (c) => {
      const cwd = c.req.query("cwd");
      const all = s.runs.list({ limit: 500 });
      const run3 = (cwd ? all.find((r) => r.cwd === cwd || r.projectPath === cwd) : void 0) ?? all[0] ?? null;
      return c.json({ run: run3 });
    });
    app.get("/api/runs/:id", (c) => {
      const run3 = s.runs.get(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      const skill = s.skills.get(run3.skillKey);
      const started = s.runs.workflowOf(run3.id);
      const workflow = started.from !== "none" ? started : skill ? s.workflow.cachedWorkflow(skill) : started;
      return c.json({ run: run3, skill, workflow, asks: s.broker.pending(run3.id), grant: s.outputs.grant(run3.id), resume: resumeInfo(run3, process.platform) });
    });
    app.get("/api/runs/:id/events", (c) => {
      const id = c.req.param("id");
      const run3 = s.runs.get(id);
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      const last = Number(c.req.header("last-event-id"));
      const fromQ = Number(c.req.query("from"));
      const from = Number.isInteger(last) && last >= 0 ? last + 1 : Number.isInteger(fromQ) && fromQ >= 0 ? fromQ : 0;
      return streamSSE(c, async (stream2) => {
        let index = from;
        const queue = [];
        let wake = null;
        const unsub = ctx.hub.subscribe([`run:${id}`], (_t, data) => {
          queue.push(data);
          wake?.();
        });
        let aborted = false;
        stream2.onAbort(() => {
          aborted = true;
          wake?.();
        });
        try {
          const stored = s.runs.events(id);
          let skipLive = queue.length;
          for (const e of stored.slice(from)) await stream2.writeSSE({ id: String(index++), event: "event", data: JSON.stringify(e) });
          const isOver = () => ENDED.has(s.runs.get(id)?.status ?? "finished");
          const ping = setInterval(() => void stream2.write(": ping\n\n"), 15e3);
          try {
            for (; ; ) {
              while (queue.length) {
                const e = queue.shift();
                if (skipLive > 0) {
                  skipLive--;
                  continue;
                }
                await stream2.writeSSE({ id: String(index++), event: "event", data: JSON.stringify(e) });
              }
              if (aborted) return;
              if (isOver()) {
                await stream2.writeSSE({ event: "end", data: JSON.stringify({ status: s.runs.get(id)?.status ?? null }) });
                return;
              }
              await new Promise((r) => {
                wake = r;
                setTimeout(r, 1e3);
              });
              wake = null;
            }
          } finally {
            clearInterval(ping);
          }
        } finally {
          unsub();
        }
      });
    });
    app.post("/api/runs/:id/stop", async (c) => {
      const run3 = s.runs.get(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      await s.runs.stop(run3.id);
      return c.json({ ok: true });
    });
    app.post("/api/runs/:id/rating", async (c) => {
      const run3 = s.runs.get(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      let body = {};
      try {
        body = await c.req.json();
      } catch {
      }
      if (!(body.rating === 1 || body.rating === -1 || body.rating === null)) return c.json({ error: "rating must be 1, -1 or null." }, 400);
      if (!(body.note === null || body.note === void 0 || typeof body.note === "string")) return c.json({ error: "note must be text." }, 400);
      if (typeof body.note === "string" && body.note.length > 2e3) return c.json({ error: "Notes can be up to 2,000 characters." }, 400);
      s.runs.rate(run3.id, body.rating, typeof body.note === "string" && body.note.trim() ? body.note : null);
      return c.json({ run: s.runs.get(run3.id) });
    });
    app.delete("/api/runs/:id", (c) => {
      const run3 = s.runs.get(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      try {
        s.runs.remove(run3.id);
      } catch (err) {
        return c.json({ error: err.message }, 409);
      }
      return c.json({ ok: true });
    });
    app.delete("/api/runs", (c) => c.json({ removed: s.runs.removeAll({ skillKey: c.req.query("skill") || void 0 }) }));
  };
}

// src/server/routes/settings.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { existsSync as existsSync5, readdirSync as readdirSync6, statSync as statSync7 } from "node:fs";
import { join as join11 } from "node:path";
function folderBytes(root, limit = 5e4) {
  let total = 0;
  let seen = 0;
  const stack = [root];
  while (stack.length && seen < limit) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = readdirSync6(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      seen++;
      const p = join11(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += statSync7(p).size;
        } catch {
        }
      }
    }
  }
  return total;
}
function nodeVersion(path) {
  try {
    return execFileSync2(path, ["--version"], { timeout: 3e3 }).toString().trim().replace(/^v/, "");
  } catch {
    return null;
  }
}
function settingsRoutes(deps) {
  return (app, ctx) => {
    app.get("/api/settings", (c) => {
      const config = ctx.config();
      const claudeHome = deps.claudeHome();
      const claudeJson = join11(claudeHome, "..", ".claude.json");
      const bin = deps.claudeBin();
      const node = config.nodePath ?? process.execPath;
      return c.json({
        config,
        folders: {
          claudeHome: { path: claudeHome, found: existsSync5(claudeHome) },
          claudeJson: { path: claudeJson, found: existsSync5(claudeJson) },
          claudeBin: { path: bin, found: bin !== null },
          node: { path: node, version: nodeVersion(node) },
          data: { path: ctx.paths.root, bytes: folderBytes(ctx.paths.root) }
        },
        version: VERSION
      });
    });
    app.patch("/api/settings", async (c) => {
      let body = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Send the settings to change." }, 400);
      }
      const patch = {};
      if ("port" in body) {
        if (typeof body.port !== "number" || !Number.isInteger(body.port) || body.port < 1024 || body.port > 65535) return c.json({ error: "The port must be a number from 1024 to 65535." }, 400);
        patch.port = body.port;
      }
      if ("ignored" in body) {
        if (!Array.isArray(body.ignored) || body.ignored.some((x) => typeof x !== "string")) return c.json({ error: "Ignored skills must be a list of names or patterns." }, 400);
        const list = body.ignored.map((x) => x.trim()).filter(Boolean);
        if (list.length > 200) return c.json({ error: "Up to 200 ignored skills or patterns." }, 400);
        patch.ignored = list;
      }
      for (const key of ["claudePath", "nodePath", "claudeHome"]) {
        if (!(key in body)) continue;
        const v = body[key];
        if (v === null) patch[key] = null;
        else if (typeof v === "string" && existsSync5(v)) patch[key] = v;
        else return c.json({ error: `That ${key === "claudeHome" ? "folder" : "file"} does not exist.` }, 400);
      }
      for (const key of ["maxRuns", "backfillDays"]) {
        if (!(key in body)) continue;
        const v = body[key];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > (key === "maxRuns" ? 10 : 3650)) return c.json({ error: `${key} is out of range.` }, 400);
        patch[key] = v;
      }
      const before = ctx.config();
      const config = saveConfig(ctx.paths, patch);
      return c.json({ config, restartNeeded: patch.port !== void 0 && patch.port !== before.port });
    });
  };
}

// src/server/routes/skills.ts
function skillsRoutes(skills, hasGraph = (s) => s.hasWorkflow) {
  return (app, ctx) => {
    app.get("/api/skills", (c) => c.json({ skills: skills.list().map((s) => ({ ...s, hasGraph: hasGraph(s) })), ignored: ctx.config().ignored }));
    app.post("/api/skills/:key/ignore", async (c) => {
      const key = c.req.param("key");
      if (!skills.get(key)) return c.json({ error: "No skill with that key." }, 404);
      let body = {};
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Send { ignored: true | false }." }, 400);
      }
      if (typeof body.ignored !== "boolean") return c.json({ error: "Send { ignored: true | false }." }, 400);
      skills.setIgnored(key, body.ignored);
      return c.json({ ok: true, skill: skills.get(key) });
    });
  };
}

// src/server/routes/steps.ts
var STEP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
var STATUSES2 = /* @__PURE__ */ new Set(["started", "done", "failed", "skipped"]);
function stepsRoutes(runs) {
  return (app, ctx) => {
    app.post("/api/runs/:id/steps", async (c) => {
      if (c.get("via") !== "bearer") return c.text("Unauthorized", 401);
      const run3 = runs.get(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      if (!["running", "waiting"].includes(run3.status)) return c.json({ error: "This run has ended." }, 409);
      let body = {};
      try {
        body = await c.req.json();
      } catch {
      }
      if (typeof body.stepId !== "string" || !STEP_ID.test(body.stepId)) return c.json({ error: "stepId must be a short id of letters, digits, '.', '_' or '-'." }, 400);
      if (typeof body.status !== "string" || !STATUSES2.has(body.status)) return c.json({ error: "status must be started, done, failed or skipped." }, 400);
      const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
      runs.append(run3.id, { t: "step", at: ctx.now(), stepId: body.stepId, status: body.status, note });
      return c.json({ ok: true });
    });
  };
}

// src/server/routes/uploads.ts
import { randomBytes as randomBytes5 } from "node:crypto";
import { mkdirSync as mkdirSync5, readdirSync as readdirSync7, rmSync as rmSync3, statSync as statSync8, writeFileSync as writeFileSync6 } from "node:fs";
import { basename as basename4, join as join12 } from "node:path";
var MAX_UPLOAD = 200 * 1024 * 1024;
var STALE_MS = 60 * 60 * 1e3;
function uploadsRoutes(app, ctx) {
  const root = join12(ctx.paths.runs, "_uploads");
  const sweep = () => {
    try {
      for (const d of readdirSync7(root)) {
        const dir = join12(root, d);
        if (ctx.now() - statSync8(dir).mtimeMs > STALE_MS) rmSync3(dir, { recursive: true, force: true });
      }
    } catch {
    }
  };
  app.post("/api/uploads", async (c) => {
    sweep();
    const declared = Number(c.req.header("content-length") ?? "0");
    if (declared > MAX_UPLOAD) return c.json({ error: "Files up to 200 MB can be attached." }, 413);
    const raw2 = c.req.header("x-filename") ?? "file";
    const name = basename4(decodeURIComponent(raw2).replace(/\\/g, "/")).replace(/^\.+/, "").slice(0, 200) || "file";
    const body = Buffer.from(await c.req.arrayBuffer());
    if (body.length > MAX_UPLOAD) return c.json({ error: "Files up to 200 MB can be attached." }, 413);
    const id = randomBytes5(9).toString("base64url");
    const dir = join12(root, id);
    mkdirSync5(dir, { recursive: true });
    writeFileSync6(join12(dir, name), body);
    writeFileSync6(join12(dir, ".name"), name);
    return c.json({ id, name, bytes: body.length });
  });
}

// src/server/routes/workflow.ts
function workflowRoutes(skills, workflow) {
  return (app, _ctx) => {
    app.get("/api/skills/:key/workflow", (c) => {
      const skill = skills.get(c.req.param("key"));
      return skill ? c.json(workflow.cachedWorkflow(skill)) : c.json({ error: "No skill with that key." }, 404);
    });
    app.post("/api/skills/:key/draw", async (c) => {
      const skill = skills.get(c.req.param("key"));
      if (!skill) return c.json({ error: "No skill with that key." }, 404);
      return c.json(await workflow.resolveWorkflow(skill, { draw: true }));
    });
  };
}

// src/server/services.ts
import { statSync as statSync10 } from "node:fs";

// src/server/routes/continue.ts
function continueRoutes(runs, claudeBin, launch) {
  return (app, _ctx) => {
    app.post("/api/runs/:id/continue", async (c) => {
      const run3 = runs.get(c.req.param("id"));
      if (!run3) return c.json({ error: "No run with that id." }, 404);
      let body = {};
      try {
        body = await c.req.json();
      } catch {
      }
      if (body.where !== "terminal" && body.where !== "desktop") return c.json({ error: "where must be terminal or desktop." }, 400);
      const bin = claudeBin();
      if (!bin) return c.json({ error: "Claude Code was not found." }, 409);
      const r = await continueRun(run3, body.where, bin, launch);
      return r.ok ? c.json({ ok: true, message: r.message }) : c.json({ error: r.message }, r.status);
    });
  };
}

// src/server/skills.ts
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync6, readFileSync as readFileSync8, readdirSync as readdirSync8, realpathSync as realpathSync2, statSync as statSync9, watch } from "node:fs";
import { homedir as homedir8 } from "node:os";
import { basename as basename5, join as join13 } from "node:path";

// src/shared/skill-md.ts
var BAD_HEADER = "Could not read this skill's header";
function unquote(v) {
  const t = v.trim();
  if (t.length >= 2 && (t[0] === '"' && t.at(-1) === '"' || t[0] === "'" && t.at(-1) === "'")) return t.slice(1, -1);
  return t;
}
function parseSkillMd(text) {
  const fail = { name: null, description: null, warning: BAD_HEADER };
  const src = text.startsWith("\uFEFF") ? text.slice(1) : text;
  if (!/^---\r?\n/.test(src)) return fail;
  const body = src.slice(src.indexOf("\n") + 1);
  const end = body.search(/^---\s*$/m);
  if (end < 0) return fail;
  const lines2 = body.slice(0, end).split(/\r?\n/);
  const fields = /* @__PURE__ */ new Map();
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    if (!line.trim() || line.trimStart().startsWith("#") || /^\s/.test(line)) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const raw2 = line.slice(colon + 1).trim();
    if (raw2 === ">" || raw2 === "|" || raw2 === ">-" || raw2 === "|-") {
      const block = [];
      while (i + 1 < lines2.length && (/^\s/.test(lines2[i + 1]) || lines2[i + 1] === "")) block.push(lines2[++i].trim());
      while (block.length && block.at(-1) === "") block.pop();
      fields.set(key, raw2.startsWith(">") ? block.join(" ").replace(/\s+/g, " ").trim() : block.join("\n"));
    } else {
      fields.set(key, unquote(raw2));
    }
  }
  const name = fields.get("name") || null;
  const description = fields.get("description") || null;
  return { name, description, warning: name === null && description === null ? BAD_HEADER : null };
}

// src/shared/workflow-map.ts
var WORKFLOW_MAP_MAX_BYTES = 8192;
var MAX_STEP_DEPTH = 2;
var MAX_STEPS = 8;
var MAX_AGENTS = 6;
var MAX_AGENT_NAME = 40;
var STEP_KINDS = /* @__PURE__ */ new Set(["action", "decision", "loop"]);
var OPEN = /^\s*```pulsar-workflow\s*$/;
var CLOSE = /^\s*```\s*$/;
var FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function looseKey(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
var isWs = (c) => /\s/.test(c);
var isTerminator = (c) => c === "\n" || c === "\r" || c === "\u2028" || c === "\u2029";
function parseHeading(line, min, max) {
  let n = 0;
  while (n < line.length && line[n] === "#") n++;
  if (n < min || n > max) return null;
  const s = line.slice(n);
  if (!s || !isWs(s[0])) return null;
  let lead = 0;
  while (lead < s.length && isWs(s[lead])) lead++;
  const t = s.slice(lead);
  if (!t) {
    for (let k = s.length - 1; k >= 1; k--) if (!isTerminator(s[k])) return { level: n, title: s[k] };
    return null;
  }
  let j = t.length;
  while (j > 0 && isWs(t[j - 1])) j--;
  while (j > 0 && t[j - 1] === "#") j--;
  while (j > 0 && isWs(t[j - 1])) j--;
  const title = t.slice(0, Math.max(1, j));
  for (const c of title) if (isTerminator(c)) return null;
  return { level: n, title };
}
function stripTrailingParens(s) {
  let e = s.length;
  while (e > 0 && isWs(s[e - 1])) e--;
  if (e === 0 || s[e - 1] !== ")") return s;
  const close = e - 1;
  const open = s.indexOf("(", s.lastIndexOf(")", close - 1) + 1);
  if (open < 0 || open >= close) return s;
  let start = open;
  while (start > 0 && isWs(s[start - 1])) start--;
  return s.slice(0, start);
}
function clipText(s, n) {
  if (s.length <= n) return s;
  const cut3 = s.slice(0, n - 1);
  const atWord = cut3.replace(/\s+\S*$/, "");
  return `${atWord.length > n * 0.6 ? atWord : cut3}\u2026`;
}
function skillHeadings(md) {
  const out = /* @__PURE__ */ new Map();
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = parseHeading(line, 1, 6);
    if (!m) continue;
    const title = m.title;
    for (const key of [looseKey(title), looseKey(stripTrailingParens(title))]) {
      if (key && !out.has(key)) out.set(key, title);
    }
  }
  return out;
}
function parseOverviewSteps(v, where, idPrefix, errors, depth = 0) {
  if (!Array.isArray(v)) {
    errors.push(`${where}: expected an array`);
    return [];
  }
  return v.slice(0, MAX_STEPS).map((s, i) => {
    const w = `${where}[${i}]`;
    const id = `${idPrefix}${i + 1}`;
    if (!isObj(s) || typeof s.title !== "string" || typeof s.detail !== "string") {
      errors.push(`${w}: needs string title and detail`);
      return { id, title: "", detail: "", kind: "action" };
    }
    if (typeof s.kind !== "string" || !STEP_KINDS.has(s.kind)) errors.push(`${w}.kind: "${String(s.kind)}" is not action, decision or loop`);
    const step = {
      id,
      title: clipText(s.title, 40),
      detail: clipText(s.detail, 160),
      kind: STEP_KINDS.has(String(s.kind)) ? s.kind : "action"
    };
    if (s.branches !== void 0) {
      if (!Array.isArray(s.branches) || s.branches.some((b) => !isObj(b) || typeof b.when !== "string" || typeof b.then !== "string")) {
        errors.push(`${w}.branches: expected [{when, then}]`);
      } else {
        step.branches = s.branches.slice(0, 4).map((b) => ({ when: clipText(b.when, 90), then: clipText(b.then, 90) }));
      }
    }
    if (Array.isArray(s.agents)) {
      const agents = s.agents.filter((a) => isObj(a) && typeof a.name === "string" && a.name.trim() !== "" && typeof a.role === "string").slice(0, MAX_AGENTS).map((a) => ({ name: clipText(a.name.trim(), 40), role: clipText(a.role, 120) }));
      if (agents.length) step.agents = agents;
    }
    if (step.kind === "loop" && typeof s.maxPasses === "number" && Number.isInteger(s.maxPasses) && s.maxPasses >= 1 && s.maxPasses <= 10) {
      step.maxPasses = s.maxPasses;
    }
    if (step.kind === "decision" && !step.branches?.length) step.kind = "action";
    if (s.children !== void 0) {
      if (depth >= MAX_STEP_DEPTH) errors.push(`${w}.children: nested deeper than ${MAX_STEP_DEPTH}`);
      else {
        const children = parseOverviewSteps(s.children, `${w}.children`, `${id}.`, errors, depth + 1);
        if (children.length) step.children = children;
      }
    }
    return step;
  });
}
function fenceOf(line) {
  const m = FENCE_LINE.exec(line);
  if (!m) return null;
  if (m[1][0] === "`" && m[2].includes("`")) return null;
  return { ch: m[1][0], len: m[1].length, rest: m[2] };
}
function locate(md) {
  const lines2 = md.split("\n");
  let open = null;
  let start = -1;
  let end = -1;
  let blocks = 0;
  let unclosed = false;
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    if (!open && OPEN.test(line)) {
      blocks++;
      let close = -1;
      for (let j = i + 1; j < lines2.length; j++) {
        if (CLOSE.test(lines2[j])) {
          close = j;
          break;
        }
      }
      if (close < 0) {
        unclosed = true;
        break;
      }
      if (blocks === 1) {
        start = i;
        end = close;
      }
      i = close;
      continue;
    }
    const f = fenceOf(line);
    if (!f) continue;
    if (!open) open = { ch: f.ch, len: f.len };
    else if (f.ch === open.ch && f.len >= open.len && f.rest.trim() === "") open = null;
  }
  if (blocks === 0) return { none: true };
  if (blocks > 1) return { error: "more than one map" };
  if (unclosed) return { error: "the map's code block is not closed" };
  return { text: lines2.slice(start + 1, end).join("\n"), prose: [...lines2.slice(0, start), ...lines2.slice(end + 1)].join("\n") };
}
function walk2(steps, depth, visit) {
  if (!Array.isArray(steps)) return;
  for (const s of steps) {
    if (!isObj(s)) continue;
    visit(s, depth);
    walk2(s.children, depth + 1, visit);
  }
}
function stripNumber(s) {
  return s.replace(/^\s*(?:step\s+)?\d+(?:\.\d+)*(?:\s*[.:)]\s*|\s+)/i, "");
}
function readWorkflowMap(skillMd) {
  const found = locate(skillMd);
  if ("none" in found) return { status: "none" };
  if ("error" in found) return { status: "invalid", errors: [found.error] };
  const invalid = (...errors2) => ({ status: "invalid", errors: errors2 });
  if (new TextEncoder().encode(found.text).length > WORKFLOW_MAP_MAX_BYTES) return invalid("the map is over 8 KB");
  let raw2;
  try {
    raw2 = JSON.parse(found.text);
  } catch {
    return invalid("the map is not valid JSON");
  }
  if (!isObj(raw2)) return invalid("the map is not valid JSON");
  if (raw2.version !== 1) return invalid("the map's version must be 1");
  const placement = [];
  walk2(raw2.steps, 0, (s, depth) => {
    const title = typeof s.title === "string" ? s.title : "(untitled)";
    if ((s.maxPasses !== void 0 || s.children !== void 0) && s.kind !== "loop") placement.push(`"${title}" has a field its kind can't have`);
    else if (s.branches !== void 0 && s.kind !== "decision") placement.push(`"${title}" has a field its kind can't have`);
    if (s.children !== void 0 && depth >= MAX_STEP_DEPTH) placement.push("steps nest more than 2 levels");
  });
  if (placement.length) return invalid(...placement);
  let longAgent = null;
  walk2(raw2.steps, 0, (s) => {
    if (longAgent || !Array.isArray(s.agents)) return;
    for (const a of s.agents) if (isObj(a) && typeof a.name === "string" && a.name.trim().length > MAX_AGENT_NAME) longAgent = a.name.trim();
  });
  if (longAgent) return invalid(`the map's shape is wrong (agent name over ${MAX_AGENT_NAME} characters)`);
  const parseErrors = [];
  const steps = parseOverviewSteps(raw2.steps, "steps", "s", parseErrors);
  if (parseErrors.length) return invalid(...parseErrors.map((d) => `the map's shape is wrong (${d})`));
  if (!steps.length) return invalid("the map's shape is wrong (steps: needs at least one step)");
  const errors = [];
  const keys = /* @__PURE__ */ new Set();
  for (const h of skillHeadings(skillMd).values()) {
    const bare = stripNumber(h);
    for (const v of [h, stripTrailingParens(h), bare, stripTrailingParens(bare)]) keys.add(looseKey(v));
  }
  walk2(raw2.steps, 0, (s) => {
    if (typeof s.title === "string" && !keys.has(looseKey(s.title)) && !keys.has(looseKey(stripNumber(s.title)))) {
      errors.push(`no heading matches "${s.title}"`);
    }
  });
  const prose = found.prose.toLowerCase();
  const names = /* @__PURE__ */ new Set();
  const collect = (list) => {
    for (const s of list) {
      for (const a of s.agents ?? []) names.add(a.name);
      if (s.children) collect(s.children);
    }
  };
  collect(steps);
  for (const name of names) if (!prose.includes(name.trim().toLowerCase())) errors.push(`the steps never mention "${name}"`);
  if (errors.length) return invalid(...errors);
  return { status: "valid", map: { steps } };
}

// src/server/skills.ts
function dirs(path) {
  try {
    return readdirSync8(path, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).map((d) => d.name);
  } catch {
    return [];
  }
}
function readSkill(dir, base) {
  const file = join13(dir, "SKILL.md");
  let text;
  try {
    text = readFileSync8(file, "utf8");
  } catch {
    return null;
  }
  const header = parseSkillMd(text);
  const name = header.name?.trim() || basename5(dir);
  const map = readWorkflowMap(text);
  return {
    key: `${base.keyPrefix}${name}`,
    source: base.source,
    name,
    ref: `${base.refPrefix}${name}`,
    description: header.description ?? "",
    path: dir,
    plugin: base.plugin,
    marketplace: base.marketplace,
    projectPath: base.projectPath,
    warning: header.warning,
    hash: createHash2("sha256").update(text).digest("hex"),
    hasWorkflow: map.status === "valid",
    workflowNote: map.status === "invalid" ? `Workflow map ignored: ${map.errors[0] ?? "it could not be read"}` : null
  };
}
function pluginRoots(claudeHome) {
  const out = /* @__PURE__ */ new Map();
  try {
    const rec = JSON.parse(readFileSync8(join13(claudeHome, "plugins/installed_plugins.json"), "utf8"));
    for (const [id, entries] of Object.entries(rec.plugins ?? {})) {
      const [name = id, marketplace = null] = id.split("@");
      const list = Array.isArray(entries) ? entries : [entries];
      for (const e of list) {
        const p = e?.installPath;
        if (typeof p === "string" && existsSync6(p) && !out.has(name)) out.set(name, { path: p, marketplace });
      }
    }
    if (out.size) return out;
  } catch {
  }
  const cache = join13(claudeHome, "plugins/cache");
  for (const market of dirs(cache)) {
    for (const plugin of dirs(join13(cache, market))) {
      const versions = dirs(join13(cache, market, plugin)).map((v) => ({ v, at: statSync9(join13(cache, market, plugin, v)).mtimeMs })).sort((a, b) => cmpVersion(b.v, a.v) || b.at - a.at);
      if (versions[0] && !out.has(plugin)) out.set(plugin, { path: join13(cache, market, plugin, versions[0].v), marketplace: market });
    }
  }
  return out;
}
function cmpVersion(a, b) {
  const x = a.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  const y = b.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (Number.isNaN(x[i]) ? -1 : x[i] ?? 0) - (Number.isNaN(y[i]) ? -1 : y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
function scanSkills(opts) {
  const out = [];
  const personal = join13(opts.claudeHome, "skills");
  for (const d of dirs(personal)) {
    const s = readSkill(join13(personal, d), { source: "personal", plugin: null, marketplace: null, projectPath: null, keyPrefix: "personal:", refPrefix: "" });
    if (s) out.push(s);
  }
  for (const [plugin, { path: root, marketplace }] of pluginRoots(opts.claudeHome)) {
    const skillsDir = join13(root, "skills");
    for (const d of dirs(skillsDir)) {
      const s = readSkill(join13(skillsDir, d), { source: "plugin", plugin, marketplace, projectPath: null, keyPrefix: `plugin:${plugin}:`, refPrefix: `${plugin}:` });
      if (s) out.push(s);
    }
  }
  const same = (a, b) => {
    try {
      return realpathSync2(a) === realpathSync2(b);
    } catch {
      return false;
    }
  };
  for (const project of opts.projects) {
    const skillsDir = join13(project, ".claude/skills");
    if (same(skillsDir, personal)) continue;
    for (const d of dirs(skillsDir)) {
      const s = readSkill(join13(skillsDir, d), { source: "project", plugin: null, marketplace: null, projectPath: project, keyPrefix: `project:${project}:`, refPrefix: "" });
      if (s) out.push(s);
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return out.filter((s) => seen.has(s.key) ? false : (seen.add(s.key), true));
}
var DAY2 = 864e5;
function createSkillsService(deps) {
  let scanned = [];
  let signature = "";
  const watchers = [];
  let timer = null;
  let debounce = null;
  const claudeHome = () => deps.config().claudeHome ?? join13(homedir8(), ".claude");
  const versionOf = (key, hash) => {
    const known = deps.db.get("SELECT n FROM skill_versions WHERE skill_key = ? AND hash = ?", key, hash);
    if (known) return known.n;
    const next = (deps.db.get("SELECT MAX(n) AS m FROM skill_versions WHERE skill_key = ?", key)?.m ?? 0) + 1;
    deps.db.run("INSERT INTO skill_versions (skill_key, n, hash, first_seen_at) VALUES (?, ?, ?, ?)", key, next, hash, deps.now());
    return next;
  };
  const rows = () => {
    const ignored = deps.config().ignored;
    return scanned.map((s) => ({ ...s, version: versionOf(s.key, s.hash), ignored: isIgnored(s.ref, ignored, s.marketplace) }));
  };
  const rescan = () => {
    scanned = scanSkills({ claudeHome: claudeHome(), projects: deps.projects() });
    const now = deps.now();
    deps.db.tx(() => {
      for (const s of scanned) {
        deps.db.run(
          `INSERT INTO skills (key, source, name, ref, description, path, plugin, project_path, warning, hash, has_workflow, seen_at, removed_at, marketplace)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(key) DO UPDATE SET source=excluded.source, name=excluded.name, ref=excluded.ref, description=excluded.description,
             path=excluded.path, plugin=excluded.plugin, project_path=excluded.project_path, warning=excluded.warning, hash=excluded.hash,
             has_workflow=excluded.has_workflow, seen_at=excluded.seen_at, removed_at=NULL, marketplace=excluded.marketplace`,
          s.key,
          s.source,
          s.name,
          s.ref,
          s.description,
          s.path,
          s.plugin,
          s.projectPath,
          s.warning,
          s.hash,
          s.hasWorkflow ? 1 : 0,
          now,
          s.marketplace
        );
        versionOf(s.key, s.hash);
      }
      const keys = new Set(scanned.map((s) => s.key));
      for (const r of deps.db.all("SELECT key FROM skills WHERE removed_at IS NULL")) {
        if (!keys.has(r.key)) deps.db.run("UPDATE skills SET removed_at = ? WHERE key = ?", now, r.key);
      }
    });
    const sig = scanned.map((s) => `${s.key}:${s.hash}`).sort().join("|");
    if (sig !== signature) {
      signature = sig;
      deps.hub.publish("skills", { at: now });
    }
  };
  const list = () => {
    const now = deps.now();
    return rows().map((r) => {
      const runs = deps.db.all(
        "SELECT id, created_at, rating, status FROM runs WHERE skill_key = ? ORDER BY created_at DESC",
        r.key
      );
      const runs14 = new Array(14).fill(0);
      for (const run3 of runs) {
        const ago = Math.floor((now - run3.created_at) / DAY2);
        if (ago >= 0 && ago < 14) runs14[13 - ago] += 1;
      }
      const rated = runs.filter((x) => x.rating !== null);
      const live = runs.find((x) => x.status === "queued" || x.status === "running" || x.status === "waiting");
      return {
        ...r,
        runs14,
        rated: rated.length,
        up: rated.filter((x) => x.rating > 0).length,
        lastRunAt: runs[0]?.created_at ?? null,
        liveRunId: live?.id ?? null,
        runCount: runs.length
      };
    });
  };
  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        rescan();
      } catch {
      }
    }, 500);
  };
  return {
    list,
    get: (key) => rows().find((r) => r.key === key) ?? null,
    rescan,
    setIgnored(key, ignored) {
      const row = scanned.find((s) => s.key === key);
      if (!row) return;
      const current = deps.config().ignored.filter((p) => p !== row.ref);
      saveConfig(deps.paths, { ignored: ignored ? [...current, row.ref] : current });
      deps.hub.publish("skills", { at: deps.now() });
    },
    start() {
      rescan();
      const folders = [join13(claudeHome(), "skills"), join13(claudeHome(), "plugins"), ...deps.projects().map((p) => join13(p, ".claude/skills"))];
      for (const f of folders) {
        try {
          watchers.push(watch(f, { recursive: true }, schedule));
        } catch {
        }
      }
      timer = setInterval(schedule, 6e4);
      timer.unref?.();
    },
    stop() {
      for (const w of watchers.splice(0)) w.close();
      if (timer) clearInterval(timer);
      if (debounce) clearTimeout(debounce);
    }
  };
}

// src/server/workflow.ts
import { spawn as spawn3 } from "node:child_process";
import { existsSync as existsSync7, mkdirSync as mkdirSync6, mkdtempSync, readFileSync as readFileSync9, rmSync as rmSync4, writeFileSync as writeFileSync7 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join14 } from "node:path";
var DRAW_PROMPT = 'Read the skill below and list its steps as JSON only, no prose: {"steps":[{"title":string (at most 40 characters),"detail":string (at most 160),"kind":"action"|"decision"|"loop","children"?:[steps, only for a loop],"maxPasses"?:number (only for a loop that states a limit),"agents"?:[{"name":string,"role":string}] (only subagents the skill names)}]}. At most 8 steps, loops nest once. Do not use any tools.';
var NONE = { steps: null, from: "none", note: null };
function readSkillMd(skill) {
  try {
    return readFileSync9(join14(skill.path, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
}
var cacheFile = (p, hash) => join14(p.workflows, `${hash.replace(/[^0-9a-zA-Z]/g, "")}.json`);
function hasDrawing(skill, p) {
  return existsSync7(cacheFile(p, skill.hash));
}
function cachedWorkflow(skill, p) {
  const md = readSkillMd(skill);
  let note = null;
  if (md !== null) {
    const map = readWorkflowMap(md);
    if (map.status === "valid") return { steps: map.map.steps, from: "block", note: null };
    if (map.status === "invalid") note = `Workflow map ignored: ${map.errors[0] ?? "it could not be read"}`;
  }
  try {
    const cached = JSON.parse(readFileSync9(cacheFile(p, skill.hash), "utf8"));
    const errors = [];
    const steps = parseOverviewSteps(cached.steps, "steps", "s", errors);
    if (!errors.length && steps.length) return { steps, from: "drawn", note };
  } catch {
  }
  return { ...NONE, note };
}
function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
    }
  }
  return null;
}
function createWorkflowService(deps) {
  const timeoutMs = deps.timeoutMs ?? 9e4;
  const drawing = /* @__PURE__ */ new Map();
  function runClaude(bin, skillMd) {
    const cwd = mkdtempSync(join14(tmpdir2(), "runwell-draw-"));
    return new Promise((resolve3) => {
      let out = "";
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rmSync4(cwd, { recursive: true, force: true });
        resolve3(v);
      };
      const child = spawn3(bin, ["-p", DRAW_PROMPT, "--output-format", "json"], { cwd, env: { ...process.env, ...deps.extraEnv }, stdio: ["pipe", "pipe", "ignore"] });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done(null);
      }, timeoutMs);
      child.stdout.on("data", (d) => out += d);
      child.on("error", () => done(null));
      child.on("close", (code) => done(code === 0 ? out : null));
      child.stdin.on("error", () => {
      });
      child.stdin.end(skillMd.endsWith("\n") ? skillMd : skillMd + "\n");
    });
  }
  async function draw(skill) {
    const bin = deps.claudeBin();
    const md = readSkillMd(skill);
    if (!bin || md === null) return null;
    const out = await runClaude(bin, md);
    if (!out) return null;
    let answer = null;
    for (const line of out.split("\n").reverse()) {
      try {
        const v = JSON.parse(line);
        if (typeof v.result === "string" && v.is_error !== true) {
          answer = v.result;
          break;
        }
      } catch {
      }
    }
    if (answer === null) return null;
    const raw2 = extractJson(answer);
    if (!raw2) return null;
    const errors = [];
    const steps = parseOverviewSteps(raw2.steps, "steps", "s", errors);
    if (errors.length || !steps.length) return null;
    mkdirSync6(deps.paths.workflows, { recursive: true });
    writeFileSync7(cacheFile(deps.paths, skill.hash), JSON.stringify({ steps: raw2.steps, drawnAt: Date.now() }));
    return steps;
  }
  return {
    cachedWorkflow: (skill) => cachedWorkflow(skill, deps.paths),
    async resolveWorkflow(skill, opts) {
      const cached = cachedWorkflow(skill, deps.paths);
      if (cached.from !== "none" || !opts.draw) return cached;
      const steps = await this.drawWorkflow(skill);
      return steps ? { steps, from: "drawn", note: cached.note } : cached;
    },
    drawWorkflow(skill) {
      const inflight = drawing.get(skill.hash);
      if (inflight) return inflight;
      const p = draw(skill).catch(() => null).finally(() => drawing.delete(skill.hash));
      drawing.set(skill.hash, p);
      return p;
    }
  };
}

// src/server/services.ts
function defaultReveal(target) {
  const p = platform();
  let isDir = false;
  try {
    isDir = statSync10(target).isDirectory();
  } catch {
  }
  const child = p === "darwin" ? spawn4("open", isDir ? [target] : ["-R", target], { stdio: "ignore", detached: true }) : spawn4("xdg-open", [isDir ? target : dirname2(target)], { stdio: "ignore", detached: true });
  child.on("error", () => {
  });
  child.unref();
}
function buildServices(ctx, opts = {}) {
  const claudeHome = () => ctx.config().claudeHome ?? join15(homedir9(), ".claude");
  const projectsScan = () => scanProjects(claudeHome(), join15(claudeHome(), "..", ".claude.json"), ctx.paths.root);
  const claudeBin = () => opts.claudeBin ?? locateClaude({ configured: ctx.config().claudePath, env: process.env, home: homedir9() });
  const claudeCheck = () => claudeState({ configured: opts.claudeBin ?? ctx.config().claudePath, env: { ...process.env, ...opts.extraEnv } });
  const skills = createSkillsService({ paths: ctx.paths, db: ctx.db, hub: ctx.hub, config: ctx.config, projects: () => projectsScan().projects.map((p) => p.path), now: ctx.now });
  const workflow = createWorkflowService({ paths: ctx.paths, claudeBin, extraEnv: opts.extraEnv });
  const outputs = createOutputsService({ paths: ctx.paths, db: ctx.db, config: ctx.config, token: () => ctx.info.token, now: ctx.now, reveal: opts.reveal ?? defaultReveal });
  let driver = null;
  const driverFor = () => {
    const bin = claudeBin();
    if (!bin) throw new Error("Claude Code was not found.");
    driver ??= createClaudeDriver({ bin, home: ctx.paths.root, extraEnv: opts.extraEnv, graceMs: opts.graceMs });
    return driver;
  };
  const here = dirname2(fileURLToPath(import.meta.url));
  const mcpEntry = opts.mcpEntry ?? process.env.RUNWELL_MCP_ENTRY ?? join15(here, "mcp.js");
  let broker;
  const runs = createRunsService({
    paths: ctx.paths,
    db: ctx.db,
    hub: ctx.hub,
    config: ctx.config,
    driver: { start: (spec) => driverFor().start(spec), answer: () => {
    }, decide: () => {
    } },
    skill: (key) => skills.get(key),
    projects: () => projectsScan().projects,
    claude: async () => {
      const s = await claudeCheck();
      return { found: s.found, signedIn: s.signedIn };
    },
    workflow: (skill) => workflow.resolveWorkflow(skill, { draw: true }),
    collectOutputs: (run3, events) => outputs.collect(run3, events),
    onRunEnd: (id) => broker.closeRun(id),
    pidCommand,
    mcpServer: () => ({ command: process.execPath, args: [mcpEntry] }),
    now: ctx.now
  });
  broker = createAskBroker({
    append: runs.append,
    status: (id) => runs.get(id)?.status ?? null,
    agentOfCall: (runId, call) => {
      const e = runs.events(runId).find((x) => x.t === "tool.start" && x.id === call);
      return e && e.t === "tool.start" ? e.agentId : null;
    },
    now: ctx.now
  });
  const backfill = createBackfill({
    paths: ctx.paths,
    db: ctx.db,
    hub: ctx.hub,
    config: ctx.config,
    now: ctx.now,
    skillKeyOf: (ref) => ctx.db.get("SELECT key FROM skills WHERE ref = ? AND removed_at IS NULL ORDER BY source LIMIT 1", ref)?.key ?? null,
    marketplaceOf: (ref) => ctx.db.get("SELECT marketplace FROM skills WHERE ref = ? AND marketplace IS NOT NULL LIMIT 1", ref)?.marketplace ?? null
  });
  const routes = [
    backfillRoutes(backfill),
    claudeRoutes(claudeCheck),
    projectsRoutes,
    skillsRoutes(skills, (s) => s.hasWorkflow || hasDrawing(s, ctx.paths)),
    workflowRoutes(skills, workflow),
    stepsRoutes(runs),
    asksRoutes(broker, runs),
    outputsRoutes(outputs, (id) => runs.get(id), (id) => runs.events(id)),
    uploadsRoutes,
    runsRoutes({ runs, skills, workflow, broker, outputs }),
    settingsRoutes({ claudeBin, claudeHome }),
    continueRoutes(runs, claudeBin, opts.launch ?? systemLaunch)
  ];
  return { skills, workflow, outputs, runs, broker, backfill, routes, claudeBin };
}

// src/server/sse.ts
function createHub() {
  const subs = /* @__PURE__ */ new Set();
  return {
    publish(topic, data) {
      for (const s of subs) {
        if (!s.topics.has(topic)) continue;
        try {
          s.send(topic, data);
        } catch {
        }
      }
    },
    subscribe(topics, send) {
      const sub = { topics: new Set(topics), send };
      subs.add(sub);
      return () => void subs.delete(sub);
    },
    clients: () => subs.size
  };
}

// src/server/main.ts
var IDLE_MS = 12 * 60 * 60 * 1e3;
var UI_CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-src 'self'; frame-ancestors 'none'";
function webRoot() {
  const here = fileURLToPath2(new URL(".", import.meta.url));
  return process.env.RUNWELL_WEB_ROOT ?? join16(here, "web");
}
function serveUi(app, root) {
  app.get("*", async (c) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/")) return c.notFound();
    const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, "");
    const file = join16(root, rel);
    const inside2 = file.startsWith(root + sep3) && extname2(file) !== "";
    try {
      const body = await readFile(inside2 ? file : join16(root, "index.html"));
      const type = inside2 ? mimeOf(file) : "text/html; charset=utf-8";
      if (type.startsWith("text/html")) c.header("Content-Security-Policy", UI_CSP);
      return c.body(body, 200, { "Content-Type": type });
    } catch {
      c.header("Content-Security-Policy", UI_CSP);
      return c.html("<!doctype html><title>Runwell</title><p>The Runwell interface has not been built yet.</p>", inside2 ? 404 : 200);
    }
  });
}
async function startServer(opts = {}) {
  const p = paths(opts.home);
  const config = () => loadConfig(p);
  const db = await openDb(p.db);
  migrate(db);
  const lock = await acquire(p, opts.port ?? config().port, VERSION);
  if (!lock) {
    db.close();
    throw new Error("Another Runwell server is already running.");
  }
  db.run("DELETE FROM auth_sessions");
  const hub = createHub();
  let activeRuns = () => 0;
  const ctx = { paths: p, config, db, info: lock.info, hub, now: Date.now, activeRuns: () => activeRuns() };
  const services = buildServices(ctx, opts.services);
  activeRuns = () => services.runs.activeCount();
  services.runs.recoverOrphans();
  const app = createApp(ctx, services.routes);
  app.post("/api/shutdown", (c) => {
    if (c.get("via") !== "bearer") return c.json({ error: "Unauthorized" }, 401);
    if (ctx.activeRuns() > 0) return c.json({ error: "A run is in progress." }, 409);
    setTimeout(() => void close().then(opts.onShutdown ?? (() => process.exit(0))), 50);
    return c.json({ ok: true });
  });
  serveUi(app, webRoot());
  let lastRequest = Date.now();
  const server = await new Promise((resolve3) => {
    const s = serve({ fetch: (req) => (lastRequest = Date.now(), app.fetch(req)), port: lock.info.port, hostname: "127.0.0.1" }, () => resolve3(s));
  });
  server.requestTimeout = 0;
  server.headersTimeout = 6e4;
  services.skills.start();
  services.backfill.start();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    watch2.stop();
    services.skills.stop();
    await services.backfill.stop();
    await services.runs.shutdown();
    const closing = new Promise((r) => server.close(() => r()));
    server.closeAllConnections();
    await closing;
    lock.release();
    db.close();
  };
  const watch2 = idleWatch({
    idleMs: IDLE_MS,
    isBusy: () => ctx.activeRuns() > 0 || hub.clients() > 0 || Date.now() - lastRequest < IDLE_MS,
    onIdle: () => void close().then(() => process.exit(0))
  });
  return { info: lock.info, server, close, services };
}

// src/server/entry.ts
var emit = process.emitWarning.bind(process);
process.emitWarning = ((warning, ...rest) => {
  const text = typeof warning === "string" ? warning : warning.message;
  if (/SQLite is an experimental feature/.test(text)) return;
  emit(warning, ...rest);
});
startServer().then(
  (s) => {
    const stop = () => void s.close().then(() => process.exit(0));
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  },
  (err) => {
    process.stderr.write(`runwell: ${err.message}
`);
    process.exit(err.message.startsWith("Another Runwell server") ? 0 : 1);
  }
);
