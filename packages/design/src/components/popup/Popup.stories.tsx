/**
 * Copyright 2023 DreamNum Inc.
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

import type { Meta } from '@storybook/react';
import React, { useState } from 'react';

import { Button } from '../button/Button';
import { Popup } from './Popup';

const meta: Meta<typeof Popup> = {
    title: 'Components / Popup',
    component: Popup,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};

export default meta;

export const PopupBasic = {
    render() {
        const [visible, setVisible] = useState(false);
        const [offset, setOffset] = useState<[number, number]>([0, 0]);

        function handleClick() {
            setVisible(!visible);
            setOffset([10, 10]);
        }

        return (
            <section>
                <Button onClick={handleClick}>Click me</Button>
                <Popup visible={visible} offset={offset}>
                    <span>xxxx</span>
                </Popup>
            </section>
        );
    },
};
