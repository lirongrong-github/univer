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

import type { IMutationInfo } from '@univerjs/core';
import { CellValueType, Disposable, IUniverInstanceService, LifecycleStages, ObjectMatrix, OnLifecycle, Range, Tools } from '@univerjs/core';
import { Inject, Injector } from '@wendellhu/redi';
import type { ISetRangeValuesMutationParams } from '@univerjs/sheets';
import { ClearSelectionAllCommand, ClearSelectionContentCommand, getSheetCommandTarget, SelectionManagerService, SetRangeValuesCommand, SetRangeValuesMutation, SetRangeValuesUndoMutationFactory, SheetInterceptorService } from '@univerjs/sheets';
import type { IAddHyperLinkCommandParams, IUpdateHyperLinkCommandParams, IUpdateHyperLinkMutationParams } from '@univerjs/sheets-hyper-link';
import { AddHyperLinkCommand, AddHyperLinkMutation, HyperLinkModel, RemoveHyperLinkMutation, UpdateHyperLinkCommand, UpdateHyperLinkMutation } from '@univerjs/sheets-hyper-link';
import { hasProtocol, isLegalLink } from '../common/util';

@OnLifecycle(LifecycleStages.Starting, SheetHyperLinkSetRangeController)
export class SheetHyperLinkSetRangeController extends Disposable {
    constructor(
        @Inject(SheetInterceptorService) private readonly _sheetInterceptorService: SheetInterceptorService,
        @Inject(Injector) private readonly _injector: Injector,
        @Inject(HyperLinkModel) private readonly _hyperLinkModel: HyperLinkModel,
        @Inject(SelectionManagerService) private readonly _selectionManagerService: SelectionManagerService,
        @IUniverInstanceService private readonly _univerInstanceService: IUniverInstanceService
    ) {
        super();

        this._initCommandInterceptor();
    }

    private _initCommandInterceptor() {
        this._initAddHyperLinkCommandInterceptor();
        this._initSetRangeValuesCommandInterceptor();
        this._initUpdateHyperLinkCommandInterceptor();
        this._initClearSelectionCommandInterceptor();
    }

    private _initAddHyperLinkCommandInterceptor() {
        this.disposeWithMe(this._sheetInterceptorService.interceptCommand({

            getMutations: (command) => {
                if (command.id === AddHyperLinkCommand.id) {
                    const params = command.params as IAddHyperLinkCommandParams;
                    const { unitId, subUnitId, link } = params;
                    const redoParams: ISetRangeValuesMutationParams = {
                        unitId,
                        subUnitId,
                        cellValue: {
                            [link.row]: {
                                [link.column]: {
                                    v: link.display,
                                    t: CellValueType.STRING,
                                    p: null,
                                },
                            },
                        },
                    };

                    return {
                        redos: [{
                            id: SetRangeValuesMutation.id,
                            params: redoParams,
                        }],
                        undos: [{
                            id: SetRangeValuesMutation.id,
                            params: SetRangeValuesUndoMutationFactory(this._injector, redoParams),

                        }],
                    };
                }

                return {
                    redos: [],
                    undos: [],
                };
            },
        }));
    }

    private _initUpdateHyperLinkCommandInterceptor() {
        this.disposeWithMe(this._sheetInterceptorService.interceptCommand({
            getMutations: (command) => {
                if (command.id === UpdateHyperLinkCommand.id) {
                    const params = command.params as IUpdateHyperLinkCommandParams;
                    const { unitId, subUnitId, id, payload } = params;
                    const current = this._hyperLinkModel.getHyperLink(unitId, subUnitId, id);
                    if (current && current.display !== payload.display) {
                        const redoParams: ISetRangeValuesMutationParams = {
                            unitId,
                            subUnitId,
                            cellValue: {
                                [current.row]: {
                                    [current.column]: {
                                        v: payload.display,
                                        t: CellValueType.STRING,
                                        p: null,
                                    },
                                },
                            },
                        };

                        return {
                            redos: [{
                                id: SetRangeValuesMutation.id,
                                params: redoParams,
                            }],
                            undos: [{
                                id: SetRangeValuesMutation.id,
                                params: SetRangeValuesUndoMutationFactory(this._injector, redoParams),

                            }],
                        };
                    }
                }

                return {
                    redos: [],
                    undos: [],
                };
            },
        }));
    }

    // eslint-disable-next-line max-lines-per-function
    private _initSetRangeValuesCommandInterceptor() {
        this.disposeWithMe(this._sheetInterceptorService.interceptCommand({

            // eslint-disable-next-line max-lines-per-function
            getMutations: (command) => {
                if (command.id === SetRangeValuesCommand.id) {
                    const params = command.params as ISetRangeValuesMutationParams;

                    const { unitId, subUnitId } = params;
                    const redos: IMutationInfo[] = [];
                    const undos: IMutationInfo[] = [];
                    if (params.cellValue) {
                        // eslint-disable-next-line max-lines-per-function
                        new ObjectMatrix(params.cellValue).forValue((row, col, cell) => {
                            const cellValue = (cell?.v ?? cell?.p?.body?.dataStream.slice(0, -2) ?? '').toString();
                            const link = this._hyperLinkModel.getHyperLinkByLocation(unitId, subUnitId, row, col);

                            if (!link) {
                                if (isLegalLink(cellValue)) {
                                    const id = Tools.generateRandomId();
                                    undos.push({
                                        id: RemoveHyperLinkMutation.id,
                                        params: {
                                            unitId,
                                            subUnitId,
                                            id,
                                        },
                                    });
                                    redos.push({
                                        id: AddHyperLinkMutation.id,
                                        params: {
                                            unitId,
                                            subUnitId,
                                            link: {
                                                id,
                                                row,
                                                column: col,
                                                display: cellValue,
                                                payload: hasProtocol(cellValue) ? cellValue : `http://${cellValue}`,
                                            },
                                        },
                                    });
                                }
                                return;
                            }

                            if (link.display === cellValue) {
                                return;
                            }

                            if (!cellValue) {
                                redos.push({
                                    id: RemoveHyperLinkMutation.id,
                                    params: {
                                        unitId,
                                        subUnitId,
                                        id: link.id,
                                    },
                                });
                                undos.push({
                                    id: AddHyperLinkMutation.id,
                                    params: {
                                        unitId,
                                        subUnitId,
                                        link,
                                    },
                                });
                            }

                            const redoParams: IUpdateHyperLinkMutationParams = {
                                unitId,
                                subUnitId,
                                id: link.id,
                                payload: {
                                    payload: link.payload,
                                    display: cellValue,
                                },
                            };
                            const undoParams: IUpdateHyperLinkMutationParams = {
                                unitId,
                                subUnitId,
                                id: link.id,
                                payload: {
                                    payload: link.payload,
                                    display: link.display,
                                },
                            };
                            redos.push({
                                id: UpdateHyperLinkMutation.id,
                                params: redoParams,
                            });
                            undos.push({
                                id: UpdateHyperLinkMutation.id,
                                params: undoParams,
                            });
                        });
                    }

                    return {
                        undos,
                        redos,
                    };
                }
                return {
                    redos: [],
                    undos: [],
                };
            },
        }));
    }

    private _initClearSelectionCommandInterceptor() {
        this.disposeWithMe(this._sheetInterceptorService.interceptCommand({
            getMutations: (command) => {
                if (command.id === ClearSelectionContentCommand.id || command.id === ClearSelectionAllCommand.id) {
                    const redos: IMutationInfo[] = [];
                    const undos: IMutationInfo[] = [];
                    const selection = this._selectionManagerService.getFirst();
                    const target = getSheetCommandTarget(this._univerInstanceService);
                    if (selection && target) {
                        const { unitId, subUnitId } = target;
                        Range.foreach(selection.range, (row, col) => {
                            const link = this._hyperLinkModel.getHyperLinkByLocation(unitId, subUnitId, row, col);
                            if (link) {
                                redos.push({
                                    id: RemoveHyperLinkMutation.id,
                                    params: {
                                        unitId,
                                        subUnitId,
                                        id: link.id,
                                    },
                                });
                                undos.push({
                                    id: AddHyperLinkMutation.id,
                                    params: {
                                        unitId,
                                        subUnitId,
                                        link,
                                    },
                                });
                            }
                        });
                    }

                    return {
                        redos,
                        undos,
                    };
                }

                return {
                    redos: [],
                    undos: [],
                };
            },
        }));
    }
}
