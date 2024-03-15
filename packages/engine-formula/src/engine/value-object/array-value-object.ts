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

import type { Nullable } from '@univerjs/core';
import { isRealNum } from '@univerjs/core';

import { BooleanValue } from '../../basics/common';
import { ERROR_TYPE_SET, ErrorType } from '../../basics/error-type';
import { CELL_INVERTED_INDEX_CACHE } from '../../basics/inverted-index-cache';
import { $ARRAY_VALUE_REGEX } from '../../basics/regex';
import { compareToken } from '../../basics/token';
import { ArrayBinarySearchType, ArrayOrderSearchType, getCompare } from '../utils/compare';
import type { callbackMapFnType, callbackProductFnType, IArrayValueObject } from './base-value-object';
import { BaseValueObject, ErrorValueObject } from './base-value-object';
import { BooleanValueObject, NullValueObject, NumberValueObject, StringValueObject } from './primitive-object';

enum BatchOperatorType {
    MINUS,
    PLUS,
    MULTIPLY,
    DIVIDED,
    MOD,
    COMPARE,
    CONCATENATE_FRONT,
    CONCATENATE_BACK,
    PRODUCT,
    POW,
    ROUND,
    FLOOR,
    CEIL,
    ATAN2,
}

enum ArrayCalculateType {
    PRODUCT,
    ROW,
    COLUMN,
    SINGLE,
}

export function fromObjectToString(array: IArrayValueObject) {
    return '';
}

export function transformToValueObject(array: Array<Array<number | string | boolean | null>> = []) {
    const arrayValueList: BaseValueObject[][] = [];

    for (let r = 0; r < array.length; r++) {
        const row = array[r];

        if (arrayValueList[r] == null) {
            arrayValueList[r] = [];
        }

        for (let c = 0; c < row.length; c++) {
            const cell = row[c];

            arrayValueList[r][c] = ValueObjectFactory.create(cell);
        }
    }

    return arrayValueList;
}

export function transformToValue(array: BaseValueObject[][] = []) {
    const arrayValueList: Array<Array<string | number | boolean | null>> = [];

    for (let r = 0; r < array.length; r++) {
        const row = array[r];

        if (arrayValueList[r] == null) {
            arrayValueList[r] = [];
        }

        for (let c = 0; c < row.length; c++) {
            const cell = row[c];

            if (cell.isError()) {
                arrayValueList[r][c] = (cell as ErrorValueObject).getErrorType();
            } else {
                arrayValueList[r][c] = (cell as BaseValueObject).getValue();
            }
        }
    }

    return arrayValueList;
}

export class ArrayValueObject extends BaseValueObject {
    static create(rawValue: string | IArrayValueObject) {
        return new ArrayValueObject(rawValue);
    }

    private _values: BaseValueObject[][] = [];

    private _rowCount: number = -1;

    private _columnCount: number = -1;

    private _unitId: string = '';

    private _sheetId: string = '';

    private _currentRow: number = -1;

    private _currentColumn: number = -1;

    private _sliceCache = new Map<string, ArrayValueObject>();

    private _flattenCache: Nullable<ArrayValueObject>;

    private _flattenPosition: Nullable<{
        stringArray: BaseValueObject[];
        stringPosition: number[];
        numberArray: BaseValueObject[];
        numberPosition: number[];
    }>;

    constructor(rawValue: string | IArrayValueObject) {
        super(typeof rawValue === 'string' ? rawValue as string : fromObjectToString(rawValue as IArrayValueObject));

        this._values = this._formatValue(rawValue);
    }

    override dispose(): void {
        this._values.forEach((cells) => {
            cells.forEach((cell) => {
                cell.dispose();
            });
        });

        this._values = [];

        this._clearCache();
    }

    clone() {
        return this.map((o) => {
            return o;
        }) as ArrayValueObject;
    }

    getRowCount() {
        return this._rowCount;
    }

    setRowCount(rowCount: number) {
        this._rowCount = rowCount;
    }

    getColumnCount() {
        return this._columnCount;
    }

    setColumnCount(columnCount: number) {
        this._columnCount = columnCount;
    }

    setCurrent(row: number, column: number) {
        this._currentRow = row;
        this._currentColumn = column;
    }

    setUnitId(unitId: string) {
        this._unitId = unitId;
    }

    getUnitId() {
        return this._unitId;
    }

    setSheetId(sheetId: string) {
        this._sheetId = sheetId;
    }

    getSheetId() {
        return this._sheetId;
    }

    getCurrentRow() {
        return this._currentRow;
    }

    getCurrentColumn() {
        return this._currentColumn;
    }

    override getArrayValue() {
        return this._values;
    }

    override setArrayValue(value: BaseValueObject[][]) {
        this._clearCache();
        this._values = value;
    }

    override isArray() {
        return true;
    }

    get(row: number, column: number) {
        const rowValues = this._values[row];
        if (rowValues == null) {
            return NullValueObject.create();
        }

        const v = rowValues[column];
        if (v == null) {
            return NullValueObject.create();
        }
        return v;
    }

    getRealValue(row: number, column: number) {
        const rowValues = this._values[row];
        if (rowValues == null) {
            return null;
        }

        const v = rowValues[column];
        if (v == null) {
            return null;
        }
        return v;
    }

    set(row: number, column: number, value: BaseValueObject) {
        if (row >= this._rowCount || column >= this._columnCount) {
            throw new Error('Exceeding array bounds.');
        }

        this._clearCache();

        this._values[row][column] = value;
    }

    getRangePosition() {
        const startRow = 0;
        const rowCount = this.getRowCount();
        const startColumn = 0;
        const columnCount = this.getColumnCount();

        return {
            startRow,
            endRow: rowCount - 1,
            startColumn,
            endColumn: columnCount - 1,
        };
    }

    iterator(
        callback: (valueObject: Nullable<BaseValueObject>, rowIndex: number, columnIndex: number) => Nullable<boolean>
    ) {
        const { startRow, endRow, startColumn, endColumn } = this.getRangePosition();

        const valueList = this.getArrayValue();

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startColumn; c <= endColumn; c++) {
                if (callback(valueList[r][c], r, c) === false) {
                    return;
                }
            }
        }
    }

    iteratorReverse(
        callback: (valueObject: Nullable<BaseValueObject>, rowIndex: number, columnIndex: number) => Nullable<boolean>
    ) {
        const { startRow, endRow, startColumn, endColumn } = this.getRangePosition();

        const valueList = this.getArrayValue();

        for (let r = endRow; r >= startRow; r--) {
            for (let c = endColumn; c >= startColumn; c--) {
                if (callback(valueList[r][c], r, c) === false) {
                    return;
                }
            }
        }
    }

    getLastTruePosition() {
        let rangeSingle: Nullable<{ row: number; column: number }>;

        this.iteratorReverse((value, rowIndex, columnIndex) => {
            if (value?.isBoolean() && (value as BaseValueObject).getValue() === true) {
                rangeSingle = {
                    row: rowIndex,
                    column: columnIndex,
                };

                return false;
            }
        });

        return rangeSingle;
    }

    getFirstTruePosition() {
        let rangeSingle: Nullable<{ row: number; column: number }>;

        this.iterator((value, rowIndex, columnIndex) => {
            if (value?.isBoolean() && (value as BaseValueObject).getValue() === true) {
                rangeSingle = {
                    row: rowIndex,
                    column: columnIndex,
                };

                return false;
            }
        });

        return rangeSingle;
    }

    getFirstCell() {
        const { startRow, startColumn } = this.getRangePosition();
        return this.get(startRow, startColumn);
    }

    getLastCell() {
        const { endRow, endColumn } = this.getRangePosition();
        return this.get(endRow, endColumn);
    }

    /**
     * Referring to matrix calculations,
     * extract the matching values from a true/false matrix based on parameters and store them in a two-dimensional array.
     * implement x[x<10]
     * https://numpy.org/doc/stable/user/basics.indexing.html
     * @param takeArray
     */
    pick(takeArray: ArrayValueObject) {
        const takeArrayRowCount = takeArray.getRowCount();
        const takeArrayColumnCount = takeArray.getColumnCount();

        if (takeArrayRowCount !== this._rowCount || takeArrayColumnCount !== this._columnCount) {
            return this._createNewArray([[NullValueObject.create()]], 1, 1);
        }

        const newValue: BaseValueObject[][] = [];

        newValue[0] = [];

        for (let r = 0; r < takeArrayRowCount; r++) {
            for (let c = 0; c < takeArrayColumnCount; c++) {
                const takeCell = takeArray.get(r, c);
                const value = this.get(r, c);
                if (takeCell.isError()) {
                    continue;
                }

                if ((takeCell as BaseValueObject).getValue() === true) {
                    newValue[0].push(value);
                }
            }
        }

        return this._createNewArray(newValue, 1, newValue[0].length);
    }

    /**
     * Flatten a 2D array.
     * https://numpy.org/doc/stable/reference/generated/numpy.chararray.flatten.html#numpy.chararray.flatten
     */
    flatten() {
        if (this._flattenCache != null) {
            return this._flattenCache;
        }

        const newValue: BaseValueObject[][] = [];
        newValue[0] = [];
        for (let r = 0; r < this._rowCount; r++) {
            for (let c = 0; c < this._columnCount; c++) {
                const value = this.get(r, c);

                newValue[0].push(value);
            }
        }

        const arrayV = this._createNewArray(newValue, 1, newValue[0].length);

        this._flattenCache = arrayV;

        return arrayV;
    }

    /**
     * Flatten a 2D array.
     * In Excel, errors and blank cells are ignored, which results in a binary search that cannot strictly adhere to the number of cells.
     */
    flattenPosition() {
        if (this._flattenPosition != null) {
            return this._flattenPosition;
        }

        const stringValue: BaseValueObject[] = [];
        const numberValue: BaseValueObject[] = [];
        const stringPosition: number[] = [];
        const numberPosition: number[] = [];
        let index = 0;
        for (let r = 0; r < this._rowCount; r++) {
            for (let c = 0; c < this._columnCount; c++) {
                const value = this.get(r, c);

                if (value.isError() || value.isNull()) {
                    index++;
                    continue;
                }

                if (value.isString()) {
                    stringValue.push(value);
                    stringPosition.push(index++);
                } else {
                    numberValue.push(value);
                    numberPosition.push(index++);
                }
            }
        }

        // const stringArray = this._createNewArray(stringValue, 1, stringValue[0].length);
        // const numberArray = this._createNewArray(numberValue, 1, numberValue[0].length);

        const result = {
            stringArray: stringValue,
            numberArray: numberValue,
            stringPosition,
            numberPosition,
        };

        this._flattenPosition = result;

        return result;
    }

    /**
     * I'm looking to perform slicing operations on 2D arrays, similar to the functionality provided by NumPy.
     * https://numpy.org/doc/stable/user/basics.indexing.html
     * @rowParam start:stop:step
     * @columnParam start:stop:step
     * @param takeArray
     */
    slice(rowParam: Nullable<Array<Nullable<number>>>, columnParam: Nullable<Array<Nullable<number>>>) {
        let rowStart = 0;
        let rowStop = this._rowCount;
        let rowStep = 1;

        let columnStart = 0;
        let columnStop = this._columnCount;
        let columnStep = 1;

        if (rowParam != null) {
            rowStart = rowParam[0] || 0;
            rowStop = rowParam[1] || this._rowCount;
            rowStep = rowParam[2] || 1;
        }

        if (columnParam != null) {
            columnStart = columnParam[0] || 0;
            columnStop = columnParam[1] || this._columnCount;
            columnStep = columnParam[2] || 1;
        }

        if (rowStart >= this._rowCount || columnStart >= this._columnCount) {
            return;
        }

        const cacheKey = `${rowStart}_${rowStop}_${rowStep}_${columnStart}_${columnStop}_${columnStep}`;

        const cache = this._sliceCache.get(cacheKey);

        if (cache != null) {
            return cache;
        }

        const result: BaseValueObject[][] = [];

        const array = this._values;

        let result_row_index = 0;
        let result_column_index = 0;
        for (let r = rowStart; r < rowStop; r += rowStep) {
            result_column_index = 0;
            if (result[result_row_index] == null) {
                result[result_row_index] = [];
            }
            for (let c = columnStart; c < columnStop; c += columnStep) {
                result[result_row_index][result_column_index] = array[r][c];
                result_column_index++;
            }
            result_row_index++;
        }

        if (result.length === 0 || result[0].length === 0) {
            return;
        }

        /**
         * When iterating, arrayValue will create an inverted index cache for cell reference data.
         * If the array is created by ref, it will hit the cache,
         * but arrays derived from another array will lose the caching ability.
         * Here, based on the slice range, it is determined whether to set row and column to -1;
         * -1 means that caching is not enabled.
         */
        const startRow = rowStep > 1 ? -1 : rowStart + this._currentRow;

        const startColumn = columnStep > 1 ? -1 : columnStart + this._currentColumn;

        const newResultArray = this._createNewArray(result, result.length, result[0].length, startRow, startColumn);

        this._sliceCache.set(cacheKey, newResultArray);

        return newResultArray;
    }

    sortByRow(index: number) {
        // new Intl.Collator('zh', { numeric: true }).compare;
        const result: BaseValueObject[][] = this._transposeArray(this._values);

        result.sort(this._sort(index));

        this._clearCache();

        this._values = this._transposeArray(result);
    }

    sortByColumn(index: number) {
        this._clearCache();
        this._values.sort(this._sort(index));
    }

    transpose() {
        const transposeArray = this._transposeArray(this._values);

        const rowCount = this._rowCount;
        const columnCount = this._columnCount;

        return this._createNewArray(transposeArray, columnCount, rowCount);
    }

    /**
     * Due to the inability to effectively utilize the cache,
     * the sequential matching approach is only used for special matches in XLOOKUP and XMATCH.
     * For example, when match_mode is set to 1 and -1 for an exact match. If not found, it returns the next smaller item.
     */
    orderSearch(
        valueObject: BaseValueObject,
        searchType: ArrayOrderSearchType = ArrayOrderSearchType.MIN,
        isDesc = false,
        isFuzzyMatching = false
    ) {
        let result: Nullable<BaseValueObject>;
        let maxOrMin: Nullable<BaseValueObject>;
        let resultPosition: Nullable<{ row: number; column: number }>;

        let maxOrMinPosition: Nullable<{ row: number; column: number }>;

        const _handleMatch = (itemValue: Nullable<BaseValueObject>, row: number, column: number) => {
            if (itemValue == null) {
                return true;
            }

            let matchObject: Nullable<BaseValueObject>;
            if (isFuzzyMatching === true) {
                matchObject = itemValue.compare(valueObject as StringValueObject, compareToken.EQUALS);
            } else {
                matchObject = itemValue.isEqual(valueObject);
            }

            if (matchObject?.getValue() === true) {
                result = itemValue;
                resultPosition = { row, column };
                return false;
            }

            if (searchType === ArrayOrderSearchType.MAX) {
                if (itemValue.isGreaterThan(valueObject).getValue() === true) {
                    if (
                        maxOrMin == null ||
                        itemValue
                            .minus(valueObject)
                            .abs()
                            .isLessThanOrEqual(maxOrMin.minus(valueObject).abs())
                            .getValue() === true
                    ) {
                        maxOrMin = itemValue;
                        maxOrMinPosition = { row, column };
                    }
                }
            } else if (searchType === ArrayOrderSearchType.MIN) {
                if (itemValue.isLessThan(valueObject).getValue() === true) {
                    if (
                        maxOrMin == null ||
                        itemValue
                            .minus(valueObject)
                            .abs()
                            .isLessThanOrEqual(maxOrMin.minus(valueObject).abs())
                            .getValue() === true
                    ) {
                        maxOrMin = itemValue;
                        maxOrMinPosition = { row, column };
                    }
                }
            }
        };

        if (isDesc) {
            const rowCount = this._values.length;
            if (this._values[0] == null) {
                return;
            }
            const columnCount = this._values[0].length;

            for (let r = rowCount - 1; r >= 0; r--) {
                for (let c = columnCount - 1; c >= 0; c--) {
                    const itemValue = this._values[r][c];
                    _handleMatch(itemValue, r, c);
                }
            }
        } else {
            this.iterator((itemValue, r, c) => {
                _handleMatch(itemValue, r, c);
            });
        }

        if (result != null) {
            return resultPosition;
        }

        if (maxOrMin != null) {
            return maxOrMinPosition;
        }
    }

    binarySearch(valueObject: BaseValueObject, searchType: ArrayBinarySearchType = ArrayBinarySearchType.MIN) {
        if (valueObject.isError()) {
            return;
        }

        const { stringArray, stringPosition, numberArray, numberPosition } = this.flattenPosition();

        if (valueObject.isString()) {
            return this._binarySearch(valueObject, stringArray, stringPosition, searchType);
        }

        const result = this._binarySearch(valueObject, numberArray, numberPosition, searchType);
        // if (result == null) {
        //     result = this._binarySearch(valueObject, stringArray, stringPosition, searchType);
        // }
        return result;

        // const stringMatrix = stringArray.getArrayValue();
        // const valueStringArray = stringMatrix[0];

        // const numberMatrix = numberArray.getArrayValue();
        // const valueNumberArray = numberMatrix[0];
    }

    private _binarySearch(
        valueObject: BaseValueObject,
        searchArray: BaseValueObject[],
        positionArray: number[],
        searchType: ArrayBinarySearchType = ArrayBinarySearchType.MIN
    ) {
        const compareFunc = getCompare();

        const value = valueObject.getValue().toString();

        let start = 0;
        let end = searchArray.length - 1;

        let lastValue = null;

        while (start <= end) {
            const middle = Math.floor((start + end) / 2);
            const compareTo = searchArray[middle];

            let compare = 0;
            if (compareTo.isNull()) {
                compare = 1;
            } else {
                const compareToValue = compareTo.getValue();

                compare = compareFunc(compareToValue.toString(), value);
            }

            if (compare === 0) {
                // Found the value, return the value from the returnColumn
                return positionArray[middle];
            }

            if (compare === -1) {
                start = middle + 1;

                if (searchType === ArrayBinarySearchType.MIN) {
                    lastValue = middle;
                }
            } else {
                // compareTo > value
                end = middle - 1;

                if (searchType === ArrayBinarySearchType.MAX) {
                    lastValue = middle;
                }
            }
        }

        // Value not found
        if (lastValue == null) {
            return;
        }
        return positionArray[lastValue];
    }

    override sum() {
        let accumulatorAll: BaseValueObject = NumberValueObject.create(0);
        this.iterator((valueObject) => {
            // 'test', ' ',  blank cell, TRUE and FALSE are ignored
            if (valueObject == null || valueObject.isString() || valueObject.isBoolean() || valueObject.isNull()) {
                return true; // continue
            }

            if (valueObject.isError()) {
                accumulatorAll = valueObject;
                return false; // break
            }
            accumulatorAll = (accumulatorAll as NumberValueObject).plus(
                valueObject as BaseValueObject
            ) as BaseValueObject;
        });

        return accumulatorAll;
    }

    override max() {
        let accumulatorAll: BaseValueObject = NumberValueObject.create(Number.NEGATIVE_INFINITY);
        this.iterator((valueObject) => {
            if (valueObject == null) {
                return true; // continue
            }

            if (valueObject.isError()) {
                accumulatorAll = valueObject;
                return false; // break
            }

            // ignore boolean value in array, but not ignore in normal value object
            if (valueObject.isString() || valueObject.isNull() || valueObject.isBoolean()) {
                return true; // continue
            }

            const result = accumulatorAll.isLessThan(valueObject) as BooleanValueObject;

            if (result.getValue()) {
                accumulatorAll = valueObject as NumberValueObject;
            }
        });

        return accumulatorAll;
    }

    override min() {
        let accumulatorAll: BaseValueObject = NumberValueObject.create(Number.POSITIVE_INFINITY);

        this.iterator((valueObject) => {
            if (valueObject == null) {
                return true; // continue
            }

            if (valueObject.isError()) {
                accumulatorAll = valueObject;
                return false; // break
            }

            // ignore boolean value in array, but not ignore in normal value object
            if (valueObject.isString() || valueObject.isNull() || valueObject.isBoolean()) {
                return true; // continue
            }

            const result = accumulatorAll.isGreaterThan(valueObject) as BooleanValueObject;

            if (result.getValue()) {
                accumulatorAll = valueObject as NumberValueObject;
            }
        });

        return accumulatorAll;
    }

    override count() {
        let accumulatorAll: BaseValueObject = NumberValueObject.create(0);
        this.iterator((valueObject) => {
            // 'test', ' ',  blank cell, TRUE and FALSE are ignored
            if (valueObject == null || valueObject.isError() || valueObject.isString() || valueObject.isNull() || valueObject.isBoolean()) {
                return true; // continue
            }
            accumulatorAll = accumulatorAll.plusBy(1) as BaseValueObject;
        });

        return accumulatorAll;
    }

    override countA() {
        let accumulatorAll: BaseValueObject = NumberValueObject.create(0);
        this.iterator((valueObject) => {
            if (valueObject == null || valueObject.isNull()) {
                return true; // continue
            }

            accumulatorAll = accumulatorAll.plusBy(1);
        });

        return accumulatorAll;
    }

    override countBlank() {
        let accumulatorAll: BaseValueObject = NumberValueObject.create(0);
        this.iterator((valueObject) => {
            if (valueObject != null && !valueObject.isNull()) {
                return true; // continue
            }

            accumulatorAll = accumulatorAll.plusBy(1) as BaseValueObject;
        });

        return accumulatorAll;
    }

    override getNegative(): BaseValueObject {
        const arrayValueObject = ArrayValueObject.create('{0}');
        return arrayValueObject.minus(this);
    }

    override getReciprocal(): BaseValueObject {
        const arrayValueObject = ArrayValueObject.create('{1}');

        return arrayValueObject.divided(this);

        // return NumberValueObject.create(1).divided(this);
    }

    override plus(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.PLUS);
    }

    override minus(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.MINUS);
    }

    override multiply(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.MULTIPLY);
    }

    override divided(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.DIVIDED);
    }

    override mod(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.MOD);
    }

    override modInverse(valueObject: BaseValueObject): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return valueObject.mod(currentValue);
        });
    }

    override compare(valueObject: BaseValueObject, operator: compareToken): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.COMPARE, operator);
    }

    override concatenateFront(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.CONCATENATE_FRONT);
    }

    override concatenateBack(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.CONCATENATE_BACK);
    }

    override product(valueObject: BaseValueObject, callbackFn: callbackProductFnType): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.PRODUCT, callbackFn);
    }

    override map(callbackFn: callbackMapFnType): BaseValueObject {
        const wrappedCallbackFn = (currentValue: BaseValueObject, r: number, c: number) => {
            if (currentValue.isError()) {
                return currentValue as ErrorValueObject;
            } else {
                return callbackFn(currentValue, r, c);
            }
        };

        return this.mapValue(wrappedCallbackFn);
    }

    override mapValue(callbackFn: callbackMapFnType): BaseValueObject {
        const rowCount = this._rowCount;
        const columnCount = this._columnCount;

        const result: BaseValueObject[][] = [];

        for (let r = 0; r < rowCount; r++) {
            const rowList: BaseValueObject[] = [];
            for (let c = 0; c < columnCount; c++) {
                const currentValue = this._values?.[r]?.[c];

                if (currentValue) {
                    rowList[c] = callbackFn(currentValue, r, c);
                } else {
                    rowList[c] = ErrorValueObject.create(ErrorType.VALUE);
                }
            }
            result.push(rowList);
        }

        return this._createNewArray(result, rowCount, columnCount);
    }

    override pow(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.POW);
    }

    /**
     *
     * @param valueObject In the case of an inverse, it is certainly not an array.
     * @returns
     */
    override powInverse(valueObject: BaseValueObject): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return valueObject.pow(currentValue);
        });
    }

    override sqrt(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.sqrt();
        });
    }

    override cbrt(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.cbrt();
        });
    }

    override cos(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.cos();
        });
    }

    override acos(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.acos();
        });
    }

    override acosh(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.acosh();
        });
    }

    override sin(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.sin();
        });
    }

    override asin(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.asin();
        });
    }

    override asinh(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.asinh();
        });
    }

    override tan(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.tan();
        });
    }

    override tanh(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.tanh();
        });
    }

    override atan(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.atan();
        });
    }

    override atanh(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.atanh();
        });
    }

    override atan2(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.ATAN2);
    }

    override atan2Inverse(valueObject: BaseValueObject): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return valueObject.atan2(currentValue);
        });
    }

    override mean(ddof: number = 0): BaseValueObject {
        const sum = this.sum();

        // Like sum, ignore strings and booleans
        const count = this.count();

        return sum.divided(ddof === 0 ? count : count.minusBy(1));
    }

    override median(): BaseValueObject {
        const numberArray = this.flattenPosition().numberArray;

        const allValue = this._createNewArray([numberArray], 1, numberArray.length);

        const count = allValue.getColumnCount();

        if (count <= 1) {
            return allValue.get(0, 0);
        }

        allValue.sortByRow(0);

        if (count % 2 === 0) {
            const medianRight = allValue.get(0, count / 2);
            const medianLeft = allValue.get(0, count / 2 - 1);

            return medianRight.plus(medianLeft).divided(NumberValueObject.create(2));
        }

        return allValue.get(0, (count - 1) / 2);
    }

    /**
     * ┌──────────────┬────────────────────────────────┬───────────────────┐
     * │ Function     │ Ignore logical values and text │ Type              │
     * ├──────────────┼────────────────────────────────┼───────────────────┤
     * │ VAR.S (VAR)  │ TRUE                           │ sample            │
     * │ VAR.P (VARP) │ TRUE                           │ entire population │
     * │ VARA         │ FALSE                          │ sample            │
     * │ VARPA        │ FALSE                          │ entire population │
     * └──────────────┴────────────────────────────────┴───────────────────┘
     *
     * for VARPA and VARA, strings and FALSE are counted as 0, TRUE is counted as 1
     * for VAR.S/VAR, or VAR.P/VARP, strings,TRUE and FALSE are ignored
     * Since sum ignores strings and booleans, they are ignored here too, and VAR.S and VAR.P are used more
     *
     * VAR.S assumes that its arguments are a sample of the population, like numpy.var(data, ddof=1)
     * VAR.P assumes that its arguments are the entire population, like numpy.var(data, ddof=0)
     * numpy.var uses ddof=0 (Delta Degrees of Freedom) by default, so we use ddof=0 here
     *
     */
    override var(ddof: number = 0): BaseValueObject {
        const mean = this.mean();

        // let isError = null;
        const squaredDifferences: BaseValueObject[][] = [[]];
        this.iterator((valueObject: Nullable<BaseValueObject>) => {
            if (valueObject == null || valueObject.isError() || valueObject.isString() || valueObject.isBoolean() || valueObject.isNull()) {
                return;
            }

            const baseValueObject = valueObject.minus(mean).pow(NumberValueObject.create(2));

            if (baseValueObject.isError()) {
                return;
            }

            squaredDifferences[0].push(baseValueObject);
        });

        const { _unitId, _sheetId, _currentRow, _currentColumn } = this;

        const squaredDifferencesArrayObject = ArrayValueObject.create({
            calculateValueList: squaredDifferences,
            rowCount: 1,
            columnCount: squaredDifferences[0].length,
            unitId: _unitId,
            sheetId: _sheetId,
            row: _currentRow,
            column: _currentColumn,
        });

        return squaredDifferencesArrayObject.mean(ddof);
    }

    /**
     * STDEV.P (STDEVP): ddof=0, ignore strings and booleans
     * STDEV.S (STDEV): ddof=1, ignore strings and booleans
     *
     * STDEVPA: ddof=0,
     * STDEVA: ddof=1,
     * @returns
     */
    override std(ddof: number = 0): BaseValueObject {
        const variance = this.var(ddof);

        if (variance.isError()) {
            return variance;
        }

        return variance.sqrt();
    }

    override log(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.log();
        });
    }

    override log10(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.log10();
        });
    }

    override exp(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.exp();
        });
    }

    override abs(): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return currentValue.abs();
        });
    }

    override round(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.ROUND);
    }

    override roundInverse(valueObject: BaseValueObject): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return valueObject.round(currentValue);
        });
    }

    override floor(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.FLOOR);
    }

    override floorInverse(valueObject: BaseValueObject): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return valueObject.floor(currentValue);
        });
    }

    override ceil(valueObject: BaseValueObject): BaseValueObject {
        return this._batchOperator(valueObject, BatchOperatorType.CEIL);
    }

    override ceilInverse(valueObject: BaseValueObject): BaseValueObject {
        return this.map((currentValue) => {
            if (currentValue.isError()) {
                return currentValue;
            }
            return valueObject.ceil(currentValue);
        });
    }

    toValue() {
        return transformToValue(this._values);
    }

    private _clearCache() {
        this._flattenCache = null;
        this._sliceCache.clear();
    }

    private _sort(index: number) {
        const compare = getCompare();
        return (a: BaseValueObject[], b: BaseValueObject[]) => {
            const columnA = a[index];
            const columnB = b[index];
            if (columnA.isError() && columnA.isError()) {
                return 0;
            }
            if (columnA.isError()) {
                return 1;
            }
            if (columnB.isError()) {
                return -1;
            }
            return compare(
                (columnA as BaseValueObject).getValue() as string,
                (columnB as BaseValueObject).getValue() as string
            );
        };
    }

    private _transposeArray(array: BaseValueObject[][]) {
        // Create a new 2D array as the transposed matrix
        const rows = array.length;
        const cols = array[0].length;
        const transposedArray: BaseValueObject[][] = [];

        // Traverse the columns of the original two-dimensional array
        for (let col = 0; col < cols; col++) {
            // Create new row
            transposedArray[col] = [] as BaseValueObject[];

            // Traverse the rows of the original two-dimensional array
            for (let row = 0; row < rows; row++) {
                // Assign elements to new rows
                transposedArray[col][row] = array[row][col];
            }
        }

        return transposedArray;
    }

    private _batchOperator(
        valueObject: BaseValueObject,
        batchOperatorType: BatchOperatorType,
        operator?: compareToken | callbackProductFnType
    ): BaseValueObject {
        const valueList: BaseValueObject[] = [];

        let rowCount = this._rowCount;
        let columnCount = this._columnCount;

        if (valueObject.isArray()) {
            const valueRowCount = (valueObject as ArrayValueObject).getRowCount();
            const valueColumnCount = (valueObject as ArrayValueObject).getColumnCount();

            rowCount = Math.max(valueRowCount, rowCount);
            columnCount = Math.max(valueColumnCount, columnCount);
            /**
             * For computational scenarios where the array contains a single value,
             * adopting calculations between the array and the value can effectively utilize an inverted index.
             */
            if (valueRowCount === 1 && valueColumnCount === 1) {
                const v = (valueObject as ArrayValueObject).getFirstCell() as BaseValueObject;
                for (let c = 0; c < columnCount; c++) {
                    valueList.push(v);
                }
            } else if (valueRowCount === 1 && this._columnCount > 1) {
                const list = (valueObject as ArrayValueObject).getArrayValue();
                for (let c = 0; c < columnCount; c++) {
                    valueList.push(list[0][c] as BaseValueObject);
                }
            } else {
                return this._batchOperatorArray(valueObject, batchOperatorType, operator);
            }
        } else {
            for (let c = 0; c < columnCount; c++) {
                valueList.push(valueObject);
            }
        }

        const result: BaseValueObject[][] = [];

        for (let c = 0; c < columnCount; c++) {
            const value = valueList[c];
            this._batchOperatorValue(value, c, result, batchOperatorType, operator);
        }

        return this._createNewArray(result, rowCount, columnCount);
    }

    private _batchOperatorValue(
        valueObject: BaseValueObject,
        column: number,
        result: BaseValueObject[][],
        batchOperatorType: BatchOperatorType,
        operator?: compareToken | callbackProductFnType
    ) {
        const rowCount = this._rowCount;

        let canUseCache = false;

        const unitId = this.getUnitId();
        const sheetId = this.getSheetId();
        const startRow = this.getCurrentRow();
        const startColumn = this.getCurrentColumn();
        /**
         * If comparison operations are conducted for a single numerical value,
         * then retrieve the judgment from the inverted index. This enhances performance.
         */
        if (batchOperatorType === BatchOperatorType.COMPARE) {
            canUseCache = CELL_INVERTED_INDEX_CACHE.canUseCache(
                unitId,
                sheetId,
                column + startColumn,
                startRow,
                startRow + rowCount - 1
            );

            if (canUseCache === true) {
                if (operator === compareToken.EQUALS) {
                    const rowPositions = CELL_INVERTED_INDEX_CACHE.getCellPositions(
                        unitId,
                        sheetId,
                        column + startColumn,
                        valueObject.getValue()
                    );

                    for (let r = 0; r < rowCount; r++) {
                        if (result[r] == null) {
                            result[r] = [];
                        }
                        if (rowPositions?.includes(r + startRow)) {
                            result[r][column] = BooleanValueObject.create(true);
                        } else {
                            result[r][column] = BooleanValueObject.create(false);
                        }
                    }
                } else {
                    const rowValuePositions = CELL_INVERTED_INDEX_CACHE.getCellValuePositions(
                        unitId,
                        sheetId,
                        column + startColumn
                    );

                    if (rowValuePositions != null) {
                        rowValuePositions.forEach((rowPositions, rowValue) => {
                            let currentValue: Nullable<BaseValueObject> = NullValueObject.create(); // handle blank cell
                            if (typeof rowValue === 'string') {
                                currentValue = StringValueObject.create(rowValue);
                            } else if (typeof rowValue === 'number') {
                                currentValue = NumberValueObject.create(rowValue);
                            } else if (typeof rowValue === 'boolean') {
                                currentValue = BooleanValueObject.create(rowValue);
                            }

                            const matchResult = currentValue.compare(valueObject, operator as compareToken);
                            if ((matchResult as BooleanValueObject).getValue() === true) {
                                rowPositions.forEach((index) => {
                                    if (index >= startRow && index <= startRow + rowCount - 1) {
                                        if (result[index - startRow] == null) {
                                            result[index - startRow] = [];
                                        }
                                        result[index - startRow][column] = BooleanValueObject.create(true);
                                    }
                                });
                            }
                        });

                        for (let r = 0; r < rowCount; r++) {
                            if (result[r] == null) {
                                result[r] = [];
                            }

                            if (result[r][column] == null) {
                                result[r][column] = BooleanValueObject.create(false);
                            }
                        }
                    } else {
                        for (let r = 0; r < rowCount; r++) {
                            if (result[r] == null) {
                                result[r] = [];
                            }

                            result[r][column] = BooleanValueObject.create(false);
                        }
                    }
                }

                return;
            }
        }

        for (let r = 0; r < rowCount; r++) {
            const currentValue = this._values?.[r]?.[column];
            if (result[r] == null) {
                result[r] = [];
            }
            if (currentValue && valueObject) {
                if (currentValue.isError()) {
                    result[r][column] = currentValue as ErrorValueObject;
                } else if (valueObject.isError()) {
                    // 1 + #NAME? gets #NAME?
                    result[r][column] = valueObject;
                } else {
                    switch (batchOperatorType) {
                        case BatchOperatorType.PLUS:
                            result[r][column] = currentValue.plus(valueObject);
                            break;
                        case BatchOperatorType.MINUS:
                            result[r][column] = currentValue.minus(valueObject);
                            break;
                        case BatchOperatorType.MULTIPLY:
                            result[r][column] = currentValue.multiply(valueObject);
                            break;
                        case BatchOperatorType.DIVIDED:
                            result[r][column] = currentValue.divided(valueObject);
                            break;
                        case BatchOperatorType.MOD:
                            result[r][column] = currentValue.mod(valueObject);
                            break;
                        case BatchOperatorType.COMPARE:
                            if (!operator) {
                                result[r][column] = ErrorValueObject.create(ErrorType.VALUE);
                            } else {
                                result[r][column] = currentValue.compare(valueObject, operator as compareToken);
                            }
                            break;
                        case BatchOperatorType.CONCATENATE_FRONT:
                            result[r][column] = currentValue.concatenateFront(valueObject);
                            break;
                        case BatchOperatorType.CONCATENATE_BACK:
                            result[r][column] = currentValue.concatenateBack(valueObject);
                            break;
                        case BatchOperatorType.PRODUCT:
                            if (!operator) {
                                result[r][column] = ErrorValueObject.create(ErrorType.VALUE);
                            } else {
                                result[r][column] = currentValue.product(
                                    valueObject,
                                    operator as callbackProductFnType
                                );
                            }
                            break;
                        case BatchOperatorType.POW:
                            result[r][column] = currentValue.pow(valueObject);
                            break;
                        case BatchOperatorType.ROUND:
                            result[r][column] = currentValue.round(valueObject);
                            break;
                        case BatchOperatorType.FLOOR:
                            result[r][column] = currentValue.floor(valueObject);
                            break;
                        case BatchOperatorType.ATAN2:
                            result[r][column] = currentValue.atan2(valueObject);
                            break;
                        case BatchOperatorType.CEIL:
                            result[r][column] = currentValue.ceil(valueObject);
                            break;
                    }
                }
            } else {
                result[r][column] = ErrorValueObject.create(ErrorType.NA);
            }

            /**
             * Inverted indexing enhances matching performance.
             */
            if (currentValue == null) {
                continue;
            }
            if (currentValue.isError()) {
                CELL_INVERTED_INDEX_CACHE.set(
                    unitId,
                    sheetId,
                    column + startColumn,
                    (currentValue as ErrorValueObject).getErrorType(),
                    r + startRow
                );
            } else if (currentValue.isNull()) {
                CELL_INVERTED_INDEX_CACHE.set(unitId, sheetId, column + startColumn, null, r + startRow);
            } else {
                CELL_INVERTED_INDEX_CACHE.set(
                    unitId,
                    sheetId,
                    column + startColumn,
                    currentValue.getValue(),
                    r + startRow
                );
            }
        }

        CELL_INVERTED_INDEX_CACHE.setContinueBuildingCache(
            unitId,
            sheetId,
            column + startColumn,
            startRow,
            startRow + rowCount - 1
        );
    }

    private _batchOperatorArray(
        valueObject: BaseValueObject,
        batchOperatorType: BatchOperatorType,
        operator?: compareToken | callbackProductFnType
    ) {
        let rowCount = (valueObject as ArrayValueObject).getRowCount();
        let columnCount = (valueObject as ArrayValueObject).getColumnCount();

        if (rowCount < this._rowCount) {
            rowCount = this._rowCount;
        }

        if (columnCount < this._columnCount) {
            columnCount = this._columnCount;
        }

        const result: BaseValueObject[][] = [];

        const valueObjectList = (valueObject as ArrayValueObject).getArrayValue();

        const currentCalculateType = this._checkArrayCalculateType(this as ArrayValueObject);

        const opCalculateType = this._checkArrayCalculateType(valueObject as ArrayValueObject);

        for (let r = 0; r < rowCount; r++) {
            const rowList: BaseValueObject[] = [];
            for (let c = 0; c < columnCount; c++) {
                let currentValue: Nullable<BaseValueObject>;
                if (currentCalculateType === ArrayCalculateType.SINGLE) {
                    currentValue = this._values?.[0]?.[0];
                } else if (currentCalculateType === ArrayCalculateType.ROW) {
                    currentValue = this._values?.[0]?.[c];
                } else if (currentCalculateType === ArrayCalculateType.COLUMN) {
                    currentValue = this._values?.[r]?.[0];
                } else {
                    currentValue = this._values?.[r]?.[c];
                }

                let opValue: Nullable<BaseValueObject>;
                if (opCalculateType === ArrayCalculateType.SINGLE) {
                    opValue = valueObjectList?.[0]?.[0];
                } else if (opCalculateType === ArrayCalculateType.ROW) {
                    opValue = valueObjectList?.[0]?.[c];
                } else if (opCalculateType === ArrayCalculateType.COLUMN) {
                    opValue = valueObjectList?.[r]?.[0];
                } else {
                    opValue = valueObjectList?.[r]?.[c];
                }

                if (currentValue && opValue) {
                    if (currentValue.isError()) {
                        rowList[c] = currentValue as ErrorValueObject;
                    } else if (opValue.isError()) {
                        rowList[c] = opValue as ErrorValueObject;
                    } else {
                        switch (batchOperatorType) {
                            case BatchOperatorType.PLUS:
                                rowList[c] = currentValue.plus(opValue);
                                break;
                            case BatchOperatorType.MINUS:
                                rowList[c] = currentValue.minus(opValue);
                                break;
                            case BatchOperatorType.MULTIPLY:
                                rowList[c] = currentValue.multiply(opValue);
                                break;
                            case BatchOperatorType.DIVIDED:
                                rowList[c] = currentValue.divided(opValue);
                                break;
                            case BatchOperatorType.MOD:
                                rowList[c] = currentValue.mod(opValue);
                                break;
                            case BatchOperatorType.COMPARE:
                                if (!operator) {
                                    rowList[c] = ErrorValueObject.create(ErrorType.VALUE);
                                } else {
                                    rowList[c] = currentValue.compare(opValue, operator as compareToken);
                                }
                                break;
                            case BatchOperatorType.CONCATENATE_FRONT:
                                rowList[c] = currentValue.concatenateFront(opValue);
                                break;
                            case BatchOperatorType.CONCATENATE_BACK:
                                rowList[c] = currentValue.concatenateBack(opValue);
                                break;
                            case BatchOperatorType.PRODUCT:
                                if (!operator) {
                                    rowList[c] = ErrorValueObject.create(ErrorType.VALUE);
                                } else {
                                    rowList[c] = currentValue.product(opValue, operator as callbackProductFnType);
                                }
                                break;
                            case BatchOperatorType.POW:
                                rowList[c] = currentValue.pow(opValue);
                                break;
                            case BatchOperatorType.ROUND:
                                rowList[c] = currentValue.round(opValue);
                                break;
                            case BatchOperatorType.ATAN2:
                                rowList[c] = currentValue.atan2(opValue);
                                break;
                            case BatchOperatorType.FLOOR:
                                rowList[c] = currentValue.floor(opValue);
                                break;
                            case BatchOperatorType.CEIL:
                                rowList[c] = currentValue.ceil(opValue);
                                break;
                        }
                    }
                }
                // else if (currentValue) {
                //     rowList[c] = currentValue;
                // } else if (opValue) {
                //     rowList[c] = opValue;
                // }
                else {
                    rowList[c] = ErrorValueObject.create(ErrorType.NA);
                }
            }
            result.push(rowList);
        }

        return this._createNewArray(result, rowCount, columnCount);
    }

    private _checkArrayCalculateType(valueObject: ArrayValueObject) {
        if (valueObject.getRowCount() === 1 && valueObject.getColumnCount() === 1) {
            return ArrayCalculateType.SINGLE;
        }

        if (valueObject.getRowCount() === 1) {
            return ArrayCalculateType.ROW;
        }
        if (valueObject.getColumnCount() === 1) {
            return ArrayCalculateType.COLUMN;
        }

        return ArrayCalculateType.PRODUCT;
    }

    private _formatValue(rawValue: string | IArrayValueObject) {
        if (typeof rawValue !== 'string') {
            rawValue = rawValue as IArrayValueObject;

            this._rowCount = rawValue.rowCount;

            this._columnCount = rawValue.columnCount;

            this._unitId = rawValue.unitId;

            this._sheetId = rawValue.sheetId;

            this._currentRow = rawValue.row;

            this._currentColumn = rawValue.column;

            return rawValue.calculateValueList;
        }
        rawValue = rawValue.slice(1, -1) as string;
        const rowArray = rawValue.split(';');
        const rowArrayCount = rowArray.length;
        const result: BaseValueObject[][] = [];
        let maxColumnCount = 0;
        for (let r = 0; r < rowArrayCount; r++) {
            const columnRaw = rowArray[r];
            const columnArray = columnRaw.split(',');
            const columnArrayCount = columnArray.length;

            if (maxColumnCount < columnArrayCount) {
                maxColumnCount = columnArrayCount;
            }

            const row: BaseValueObject[] = [];
            for (let c = 0; c < columnArrayCount; c++) {
                const cellRaw = columnArray[c].trim();
                row.push(ValueObjectFactory.create(cellRaw));
            }
            result.push(row);
        }

        this._rowCount = rowArrayCount;

        this._columnCount = maxColumnCount;

        return result;
    }

    private _createNewArray(
        result: BaseValueObject[][],
        rowCount: number,
        columnCount: number,
        row: number = -1,
        column: number = -1
    ) {
        if (this._currentColumn === -1 || this._currentRow === -1) {
            row = -1;
            column = -1;
        }

        const arrayValueObjectData: IArrayValueObject = {
            calculateValueList: result,
            rowCount,
            columnCount,
            unitId: this.getUnitId(),
            sheetId: this.getSheetId(),
            row,
            column,
        };

        return ArrayValueObject.create(arrayValueObjectData);
    }
}

export class ValueObjectFactory {
    static create(rawValue: string | number | boolean | null) {
        if (rawValue == null) {
            return NullValueObject.create();
        }
        if (typeof rawValue === 'boolean') {
            return BooleanValueObject.create(rawValue);
        }
        if (typeof rawValue === 'string') {
            const rawValueUpper = rawValue.toLocaleUpperCase().trim();
            if (ERROR_TYPE_SET.has(rawValueUpper as ErrorType)) {
                return ErrorValueObject.create(rawValueUpper as ErrorType);
            }
            if (rawValueUpper === BooleanValue.TRUE || rawValueUpper === BooleanValue.FALSE) {
                return createBooleanValueObjectByRawValue(rawValue);
            }
            if (isRealNum(rawValue)) {
                return NumberValueObject.create(Number(rawValue));
            }
            if (new RegExp($ARRAY_VALUE_REGEX, 'g').test(rawValue.replace(/\n/g, '').replace(/\r/g, ''))) {
                return ArrayValueObject.create(rawValue.replace(/\n/g, '').replace(/\r/g, ''));
            }

            return createStringValueObjectByRawValue(rawValue);
        }
        if (typeof rawValue === 'number') {
            return createNumberValueObjectByRawValue(rawValue);
        }
        return ErrorValueObject.create(ErrorType.NA);
    }
}

export function createBooleanValueObjectByRawValue(rawValue: string | number | boolean) {
    if (typeof rawValue === 'boolean') {
        return BooleanValueObject.create(rawValue);
    }
    let value = false;
    if (typeof rawValue === 'string') {
        const rawValueUpper = rawValue.toLocaleUpperCase();
        if (rawValueUpper === BooleanValue.TRUE) {
            value = true;
        } else if (rawValueUpper === BooleanValue.FALSE) {
            value = false;
        }
    } else {
        if (rawValue === 1) {
            value = true;
        } else {
            value = false;
        }
    }
    return BooleanValueObject.create(value);
}

export function createStringValueObjectByRawValue(rawValue: string | number | boolean) {
    let value = rawValue.toString();

    if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.slice(1, -1);
        value = value.replace(/""/g, '"');
    }

    return StringValueObject.create(value);
}

export function createNumberValueObjectByRawValue(rawValue: string | number | boolean) {
    if (typeof rawValue === 'number') {
        if (!Number.isFinite(rawValue)) {
            return ErrorValueObject.create(ErrorType.NUM);
        }
        return NumberValueObject.create(rawValue);
    } else if (isRealNum(rawValue)) {
        return NumberValueObject.create(Number(rawValue));
    }
    return ErrorValueObject.create(ErrorType.NA);
}
