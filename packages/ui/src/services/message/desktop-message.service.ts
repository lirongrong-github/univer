/**
 * Copyright 2023-present DreamNum Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { IMessageOptions, IMessageProps } from '@univerjs/design';
import { Message } from '@univerjs/design';
import type { IDisposable } from '@wendellhu/redi';

import type { IMessageService } from './message.service';

export class DesktopMessageService implements IMessageService {
    protected _portalContainer: HTMLElement = document.body;
    protected _message?: Message;

    setContainer(container: HTMLElement): void {
        this._portalContainer = container;
        this._message = new Message(container);
    }

    show(options: IMessageOptions & Omit<IMessageProps, 'key'>): IDisposable {
        if (!this._message) {
            throw new Error('[DesktopMessageService]: no message implementation!');
        }

        const { type, ...rest } = options;
        return this._message[type](rest);
    }
}
