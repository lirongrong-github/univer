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
import React from 'react';

import { Checkbox } from './Checkbox';

const meta: Meta<typeof Checkbox> = {
    title: 'Components / Checkbox',
    component: Checkbox,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};

export default meta;

export const CheckboxBasic = {
    render() {
        return <Checkbox value="c0">checkbox 1</Checkbox>;
    },
};

export const CheckboxDisabled = {
    render() {
        return (
            <>
                <Checkbox value="c1" disabled>
                    checkbox 1
                </Checkbox>
                <Checkbox value="c2" disabled checked>
                    checkbox 2
                </Checkbox>
            </>
        );
    },
};
