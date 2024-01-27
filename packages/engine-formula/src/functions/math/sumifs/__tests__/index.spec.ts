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

import { describe, expect, it } from 'vitest';

import { ArrayValueObject, transformToValue } from '../../../../engine/value-object/array-value-object';
import { FUNCTION_NAMES_MATH } from '../../function-names';
import { Sumifs } from '..';
import { NumberValueObject, StringValueObject } from '../../../../engine/value-object/primitive-object';

describe('Test sumifs function', () => {
    const textFunction = new Sumifs(FUNCTION_NAMES_MATH.SUMIF);

    describe('Sumifs', () => {
        it('Range and criteria', async () => {
            const sumRange = new ArrayValueObject(/*ts*/ `{
                1;
                1;
                1
            }`);
            const range = new ArrayValueObject(/*ts*/ `{
                2;
                3;
                4
            }`);

            const criteria = new StringValueObject('>2');

            const resultObject = textFunction.calculate(sumRange, range, criteria);
            expect(transformToValue(resultObject.getArrayValue())).toStrictEqual([[2]]);
        });

        it('Range and array criteria', async () => {
            const sumRange = new ArrayValueObject(/*ts*/ `{
                1;
                1;
                1
            }`);
            const range = new ArrayValueObject(/*ts*/ `{
                2;
                3;
                4
            }`);

            const criteria = new ArrayValueObject(/*ts*/ `{
                >2;
                >3;
                >4
            }`);

            const resultObject = textFunction.calculate(sumRange, range, criteria);
            expect(transformToValue(resultObject.getArrayValue())).toStrictEqual([[2], [1], [0]]);
        });

        it('2 ranges and criteria', async () => {
            const sumRange = new ArrayValueObject(/*ts*/ `{
                1;
                1;
                1
            }`);

            const range1 = new ArrayValueObject(/*ts*/ `{
                2;
                3;
                4
            }`);

            const criteria1 = new StringValueObject('>2');

            const range2 = new ArrayValueObject(/*ts*/ `{
                3;
                4;
                5
            }`);

            const criteria2 = new StringValueObject('<5');

            const resultObject = textFunction.calculate(sumRange, range1, criteria1, range2, criteria2);
            expect(transformToValue(resultObject.getArrayValue())).toStrictEqual([[1]]);
        });

        it('2 ranges and criteria, 1 array criteria', async () => {
            const sumRange = new ArrayValueObject(/*ts*/ `{
                1;
                1;
                1
            }`);

            const range1 = new ArrayValueObject(/*ts*/ `{
                2;
                3;
                4
            }`);

            const criteria1 = new ArrayValueObject(/*ts*/ `{
                >2;
                >3;
                >4
            }`);

            const range2 = new ArrayValueObject(/*ts*/ `{
                3;
                4;
                5
            }`);

            const criteria2 = new NumberValueObject(5);

            const resultObject = textFunction.calculate(sumRange, range1, criteria1, range2, criteria2);
            expect(transformToValue(resultObject.getArrayValue())).toStrictEqual([[1], [1], [0]]);
        });

        it('2 ranges and criteria, 2 array criteria', async () => {
            const sumRange = new ArrayValueObject(/*ts*/ `{
                1;
                1;
                1
            }`);

            const range1 = new ArrayValueObject(/*ts*/ `{
                2;
                3;
                4
            }`);

            const criteria1 = new ArrayValueObject(/*ts*/ `{
                >2;
                >3;
                >4
            }`);

            const range2 = new ArrayValueObject(/*ts*/ `{
                3;
                4;
                5
            }`);

            const criteria2 = new ArrayValueObject(/*ts*/ `{
                4;
                4;
                4;
                4
            }`);

            const resultObject = textFunction.calculate(sumRange, range1, criteria1, range2, criteria2);
            expect(transformToValue(resultObject.getArrayValue())).toStrictEqual([[1], [0], [0], [0]]);
        });
    });
});
