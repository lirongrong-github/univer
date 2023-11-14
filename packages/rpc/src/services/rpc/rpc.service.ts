/* eslint-disable no-magic-numbers */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { RxDisposable } from '@univerjs/core';
import { createIdentifier } from '@wendellhu/redi';
import { BehaviorSubject, firstValueFrom, isObservable, Observable, of, Subscriber, Subscription } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

/** This protocol is for transferring data from the two peer univer instance running in different locations. */
export interface IMessageProtocol {
    send(message: any): void;
    onMessage: Observable<any>;
}

/**
 * Channel is a combination of methods and event sources. These methods and
 * event sources are usually provided by the same service or controller.
 */
export interface IChannel {
    call<T>(method: string, args?: any): Promise<T>;
    subscribe<T>(event: string, args?: any): Observable<T>;
}

/**
 * Wrapper a service or a controller into a channel so it could be invoked by
 * a remote client. When the protocol is called, it would forward to the
 * underlying service or controller.
 *
 * @param module the wrapper service or controller
 * @returns the channel instance
 */
export function fromModule(module: unknown): IChannel {
    const handler = module as { [key: string]: unknown };

    // Iterate over the module and find all the methods and event sources.
    // const observables = new Map<string, Observable<any>>();

    return new (class implements IChannel {
        call<T>(method: string, args?: any): Promise<T> {
            const target = handler[method];
            if (typeof target === 'function') {
                let res = target.apply(handler, [args]);
                if (!(res instanceof Promise)) {
                    res = Promise.resolve(res);
                }
                return res;
            }

            throw new Error(`[RPC]: method not found for ${method}!`);
        }

        subscribe<T>(eventMethod: string, args: any): Observable<T> {
            const target = handler[eventMethod];
            if (typeof target === 'function') {
                const res = target.apply(handler, args);
                if (!isObservable(res)) {
                    return of(res);
                }
                return res as Observable<T>;
            }

            throw new Error(`[RPC]: observable method not found for ${eventMethod}!`);
        }
    })();
}

/**
 * Wrap a channel into a service or a controller so it could be invoked by
 * the upper layer modules. When the service or controller is called, it would
 * request the remote server by calling the channel.
 *
 * @param channel
 * @returns
 */
export function toModule<T extends object>(channel: IChannel): T {
    return new Proxy({} as T, {
        get(_: T, propKey: string) {
            // eslint-disable-next-line func-names
            return function (...args: any[]) {
                const isObservable = propertyIsEventSource(propKey);
                if (isObservable) {
                    const observable = channel.subscribe(propKey, args[0]);
                    return observable;
                }

                return channel.call(propKey, args[0]);
            };
        },
    });
}

function propertyIsEventSource(name: string): boolean {
    return name.endsWith('$');
}

export interface IChannelClient {
    getChannel<T extends IChannel>(channelName: string): T;
}

/**
 *
 */
export interface IChannelServer {
    registerChannel<T extends IChannel>(channelName: string, channel: T): void;
}

const enum RequestType {
    /** A simple remote calling wrapper in a Promise. */
    CALL = 100,

    /** Subscribe to a remote Observable. */
    SUBSCRIBE = 101,

    /** Cancel subscription to that remove Observable. */
    UNSUBSCRIBE = 102,
}

interface IRPCRequest {
    seq: number;
    type: RequestType;
    channelName: string;
    method: string;
    args?: any;
}

const enum ResponseType {
    /**
     * When underlying protocol is established. The server should send the
     * client an `INITIALIZE` response to indicate that the server is up
     * and ready to provide services.
     */
    INITIALIZE = 0,

    CALL_SUCCESS = 100,
    CALL_FAILURE = 101,

    SUBSCRIBE_NEXT = 200,
    SUBSCRIBE_ERROR = 201,
    SUBSCRIBE_COMPLETE = 202,
}

// TODO@wzhudev:

interface IRPCResponse {
    /** It should be the same as its corresponding requests' `seq`. */
    seq: number;
    type: ResponseType;
    data?: any;
}

interface IResponseHandler {
    handle(response: IRPCResponse): void;
}

/**
 * This method provides implementation for `IChannel` and is responsible for
 * transforming a local calling to a RPC calling.
 */
export class ChannelClient extends RxDisposable implements IChannelClient {
    private _initialized = new BehaviorSubject<boolean>(false);
    private _lastRequestCounter = 0;
    private _pendingRequests = new Map<number, IResponseHandler>();
    private _pendingSubscriptions = new Map<number, Subscriber<any>>();

    constructor(private readonly _protocol: IMessageProtocol) {
        super();

        // TODO: subscribe to the state of the protocol and see if it is connected \
        // and initialized.
        this._protocol.onMessage.pipe(takeUntil(this.dispose$)).subscribe((message) => this._onResponse(message));
    }

    getChannel<T extends IChannel>(channelName: string): T {
        const self = this;

        return {
            call(method: string, args?: any) {
                if (self._disposed) {
                    return Promise.reject();
                }

                return self._remoteCall(channelName, method, args);
            },
            subscribe(eventMethod: string, args?: any) {
                if (self._disposed) {
                    throw new Error('[ChannelClient]: client is disposed!');
                }

                return self._remoteSubscribe(channelName, eventMethod, args);
            },
        } as T;
    }

    private _whenReady(): Promise<boolean> {
        return firstValueFrom(
            this._initialized.pipe(
                filter((v) => v),
                take(1)
            )
        );
    }

    private async _remoteCall(channelName: string, method: string, args?: any): Promise<any> {
        await this._whenReady();

        const sequence = ++this._lastRequestCounter;
        const type = RequestType.CALL;
        const request: IRPCRequest = { seq: sequence, type, channelName, method, args };
        const client = this;

        return new Promise((resolve, reject) => {
            // We trigger remote calling in this Promise's callback and deal
            // with response here as well.
            const responseHandler: IResponseHandler = {
                handle(response: IRPCResponse) {
                    switch (response.type) {
                        case ResponseType.CALL_SUCCESS:
                            client._pendingRequests.delete(sequence);
                            resolve(response.data);
                            break;
                        case ResponseType.CALL_FAILURE:
                            client._pendingRequests.delete(sequence);
                            reject(response.data);
                            break;
                        default:
                            throw new Error('[ChannelClient]: unknown response type!');
                    }
                },
            };

            this._pendingRequests.set(sequence, responseHandler);
            this._sendRequest(request);
        });
    }

    private _remoteSubscribe(channelName: string, method: string, args?: any): Observable<any> {
        return new Observable((subscriber) => {
            let sequence: number = -1;
            this._whenReady().then(() => {
                sequence = ++this._lastRequestCounter;
                const type = RequestType.SUBSCRIBE;
                const request: IRPCRequest = { seq: sequence, type, channelName, method, args };

                const responseHandler: IResponseHandler = {
                    handle(response: IRPCResponse) {
                        switch (response.type) {
                            case ResponseType.SUBSCRIBE_NEXT:
                                subscriber.next(response.data);
                                break;
                            case ResponseType.SUBSCRIBE_ERROR:
                                subscriber.error(response.data);
                                break;
                            case ResponseType.SUBSCRIBE_COMPLETE:
                                subscriber.complete();
                                break;
                            default:
                                throw new Error('[ChannelClient]: unknown response type!');
                        }
                    },
                };

                this._pendingRequests.set(sequence, responseHandler);
                this._sendRequest(request);
            });

            return () => {
                if (sequence === -1) {
                    return;
                }

                const cancelSubscriptionRequest: IRPCRequest = {
                    type: RequestType.UNSUBSCRIBE,
                    seq: sequence,
                    channelName,
                    method,
                };
                this._sendRequest(cancelSubscriptionRequest);
            };
        });
    }

    private _sendRequest(request: IRPCRequest): void {
        this._protocol.send(request);
    }

    private _onResponse(response: IRPCResponse): void {
        switch (response.type) {
            case ResponseType.INITIALIZE:
                this._initialized.next(true);
                break;
            case ResponseType.CALL_SUCCESS:
            case ResponseType.CALL_FAILURE:
            case ResponseType.SUBSCRIBE_NEXT:
            case ResponseType.SUBSCRIBE_COMPLETE:
            case ResponseType.SUBSCRIBE_ERROR:
                this._pendingRequests.get(response.seq)?.handle(response);
                break;
        }
    }
}

export class ChannelServer extends RxDisposable implements IChannelServer {
    private _channels = new Map<string, IChannel>();

    private _subscriptions = new Map<number, Subscription>();

    constructor(private readonly _protocol: IMessageProtocol) {
        super();

        this._protocol.onMessage.pipe(takeUntil(this.dispose$)).subscribe((message) => this._onRequest(message));
        this._sendResponse({ seq: -1, type: ResponseType.INITIALIZE });
    }

    registerChannel(channelName: string, channel: IChannel): void {
        this._channels.set(channelName, channel);
    }

    private _onRequest(request: IRPCRequest): void {
        switch (request.type) {
            case RequestType.CALL:
                this._onMethodCall(request);
                break;
            case RequestType.SUBSCRIBE:
                this._onSubscribe(request);
                break;
            case RequestType.UNSUBSCRIBE:
                this._onUnsubscribe(request);
                break;
            default:
                break;
        }
    }

    private _onMethodCall(request: IRPCRequest): void {
        const channel = this._channels.get(request.channelName);

        let promise: Promise<any>;
        try {
            if (!channel) {
                throw new Error('[ChannelServer]: Channel not found!');
            }
            promise = channel.call(request.method, request.args);
        } catch (err: unknown) {
            promise = Promise.reject(err);
        }

        promise
            .then((data) => {
                this._sendResponse({ seq: request.seq, type: ResponseType.CALL_SUCCESS, data });
            })
            .catch((err) => {
                if (err instanceof Error) {
                    this._sendResponse({ seq: request.seq, type: ResponseType.CALL_FAILURE, data: err.message });
                } else {
                    this._sendResponse({ seq: request.seq, type: ResponseType.CALL_FAILURE, data: String(err) });
                }
            });
    }

    private _onSubscribe(request: IRPCRequest): void {
        const channel = this._channels.get(request.channelName);

        try {
            if (!channel) {
                throw new Error('[ChannelServer]: Channel not found!');
            }

            const observable = channel.subscribe(request.method, request.args);
            const subscription = observable.subscribe({
                next: (data) => {
                    this._sendResponse({ seq: request.seq, type: ResponseType.SUBSCRIBE_NEXT, data });
                },
                error: (err) => {
                    this._sendResponse({ seq: request.seq, type: ResponseType.SUBSCRIBE_ERROR, data: err.message });
                    this._sendResponse({ seq: request.seq, type: ResponseType.SUBSCRIBE_COMPLETE });
                },
                complete: () => {
                    this._sendResponse({ seq: request.seq, type: ResponseType.SUBSCRIBE_COMPLETE });
                },
            });

            this._subscriptions.set(request.seq, subscription);
        } catch (err: unknown) {
            if (err instanceof Error) {
                this._sendResponse({ seq: request.seq, type: ResponseType.SUBSCRIBE_ERROR, data: err.message });
            } else {
                this._sendResponse({ seq: request.seq, type: ResponseType.SUBSCRIBE_ERROR, data: String(err) });
            }
        }
    }

    private _onUnsubscribe(request: IRPCRequest): void {
        const subscription = this._subscriptions.get(request.seq);
        if (subscription) {
            subscription.unsubscribe();
            this._subscriptions.delete(request.seq);
        }
    }

    private _sendResponse(response: IRPCResponse): void {
        this._protocol.send(response);
    }
}

/**
 * This service is for other service to register channels to the RPC framework.
 */
export interface IRPCService {}
export const IRPCService = createIdentifier<IRPCService>('IRPCService');
