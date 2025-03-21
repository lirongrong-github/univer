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

import type { Workbook } from '@univerjs/core';
import { BooleanNumber, Disposable, IUniverInstanceService, LifecycleStages, OnLifecycle, ThemeService, UniverInstanceType } from '@univerjs/core';
import { INTERCEPTOR_POINT, SheetInterceptorService } from '@univerjs/sheets';
import { Inject } from '@wendellhu/redi';
import { SheetSkeletonManagerService } from '@univerjs/sheets-ui';
import type { Spreadsheet } from '@univerjs/engine-render';
import { IRenderManagerService } from '@univerjs/engine-render';
import { HyperLinkModel } from '@univerjs/sheets-hyper-link';

@OnLifecycle(LifecycleStages.Ready, SheetsHyperLinkRenderController)
export class SheetsHyperLinkRenderController extends Disposable {
    constructor(
        @Inject(SheetInterceptorService) private readonly _sheetInterceptorService: SheetInterceptorService,
        @Inject(HyperLinkModel) private readonly _hyperLinkModel: HyperLinkModel,
        @IUniverInstanceService private readonly _univerInstanceService: IUniverInstanceService,
        @Inject(SheetSkeletonManagerService) private readonly _sheetSkeletonManagerService: SheetSkeletonManagerService,
        @IRenderManagerService private readonly _renderManagerService: IRenderManagerService,
        @Inject(ThemeService) private readonly _themeService: ThemeService
    ) {
        super();
        this._initViewModelIntercept();
        this._initSkeletonChange();
    }

    private _initViewModelIntercept() {
        this.disposeWithMe(
            this._sheetInterceptorService.intercept(
                INTERCEPTOR_POINT.CELL_CONTENT,
                {
                    handler: (cell, pos, next) => {
                        const { row, col, unitId, subUnitId } = pos;
                        const link = this._hyperLinkModel.getHyperLinkByLocation(unitId, subUnitId, row, col);
                        const styleSheet = this._themeService.getCurrentTheme();

                        if (link) {
                            return next({
                                ...cell,
                                interceptorStyle: {
                                    ul: {
                                        s: BooleanNumber.TRUE,
                                    },
                                    cl: {
                                        rgb: styleSheet.blue500,
                                    },
                                },
                            });
                        }

                        return next(cell);
                    },
                    priority: 100,
                }
            )
        );
    }

    private _initSkeletonChange() {
        const markSkeletonDirty = () => {
            const workbook = this._univerInstanceService.getCurrentUnitForType<Workbook>(UniverInstanceType.UNIVER_SHEET);
            if (!workbook) return;

            const unitId = workbook.getUnitId();
            const subUnitId = workbook.getActiveSheet().getSheetId();
            const skeleton = this._sheetSkeletonManagerService.getOrCreateSkeleton({ unitId, sheetId: subUnitId });
            const currentRender = this._renderManagerService.getRenderById(unitId);

            skeleton?.makeDirty(true);
            skeleton?.calculate();

            if (currentRender) {
                (currentRender.mainComponent as Spreadsheet).makeForceDirty();
            }
        };

        this.disposeWithMe(this._hyperLinkModel.linkUpdate$.subscribe(() => {
            markSkeletonDirty();
        }));
    }
}
