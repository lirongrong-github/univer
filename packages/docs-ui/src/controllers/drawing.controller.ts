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

import type { ICommandInfo } from '@univerjs/core';
import {
    BooleanNumber,
    DEFAULT_DOCUMENT_SUB_COMPONENT_ID,
    Disposable,
    ICommandService,
    IDrawingManagerService,
    IUniverInstanceService,
    LifecycleStages,
    OnLifecycle,
    PositionedObjectLayoutType,
} from '@univerjs/core';
import type { IRichTextEditingMutationParams } from '@univerjs/docs';
import { DocSkeletonManagerService, RichTextEditingMutation, SetDocZoomRatioOperation } from '@univerjs/docs';
import type { Documents, DocumentSkeleton, IRender } from '@univerjs/engine-render';
import { IRenderManagerService, Liquid } from '@univerjs/engine-render';
import { IEditorService } from '@univerjs/ui';
import { Inject } from '@wendellhu/redi';

@OnLifecycle(LifecycleStages.Steady, DocFloatingObjectController)
export class DocFloatingObjectController extends Disposable {
    private _liquid = new Liquid();

    private _pageMarginCache = new Map<string, { marginLeft: number; marginTop: number }>();

    constructor(
        @Inject(DocSkeletonManagerService) private readonly _docSkeletonManagerService: DocSkeletonManagerService,
        @IUniverInstanceService private readonly _univerInstanceService: IUniverInstanceService,
        @IRenderManagerService private readonly _renderManagerService: IRenderManagerService,
        @ICommandService private readonly _commandService: ICommandService,
        @IDrawingManagerService private readonly _drawingManagerService: IDrawingManagerService,
        @IEditorService private readonly _editorService: IEditorService
    ) {
        super();

        this._initialize();

        this._commandExecutedListener();
    }

    private _initialize() {
        this._initialRenderRefresh();

        this._updateOnPluginChange();
    }

    private _updateOnPluginChange() {
        // this._drawingManagerService.pluginUpdate$.subscribe((params) => {
        //     const docsSkeletonObject = this._docSkeletonManagerService.getCurrent();

        //     if (docsSkeletonObject == null) {
        //         return;
        //     }

        //     const { unitId, skeleton } = docsSkeletonObject;

        //     const currentRender = this._renderManagerService.getRenderById(unitId);

        //     if (currentRender == null) {
        //         return;
        //     }

        //     const { mainComponent, components, scene } = currentRender;

        //     const docsComponent = mainComponent as Documents;

        //     const { left: docsLeft, top: docsTop } = docsComponent;

        //     params.forEach((param) => {
        //         const { unitId, subUnitId, drawingId, drawing } = param;

        //         const { left = 0, top = 0, width = 0, height = 0, angle, flipX, flipY, skewX, skewY } = drawing;

        //         const cache = this._pageMarginCache.get(drawingId);

        //         const marginLeft = cache?.marginLeft || 0;
        //         const marginTop = cache?.marginTop || 0;

        //         skeleton
        //             ?.getViewModel()
        //             .getDataModel()
        //             .updateDrawing(drawingId, {
        //                 left: left - docsLeft - marginLeft,
        //                 top: top - docsTop - marginTop,
        //                 height,
        //                 width,
        //             });
        //     });

        //     skeleton?.calculate();
        //     mainComponent?.makeDirty();
        // });
    }

    private _initialRenderRefresh() {
        this._docSkeletonManagerService.currentSkeleton$.subscribe((param) => {
            if (param == null) {
                return;
            }

            const { skeleton: documentSkeleton, unitId } = param;

            const currentRender = this._renderManagerService.getRenderById(unitId);

            if (currentRender == null) {
                return;
            }

            const { mainComponent } = currentRender;

            const docsComponent = mainComponent as Documents;

            // TODO: Why NEED change skeleton here?
            docsComponent.changeSkeleton(documentSkeleton);

            this._refreshDrawing(unitId, documentSkeleton, currentRender);
        });
    }

    private _commandExecutedListener() {
        const updateCommandList = [RichTextEditingMutation.id, SetDocZoomRatioOperation.id];

        this.disposeWithMe(
            this._commandService.onCommandExecuted((command: ICommandInfo) => {
                if (updateCommandList.includes(command.id)) {
                    const params = command.params as IRichTextEditingMutationParams;
                    const { unitId: commandUnitId } = params;

                    const docsSkeletonObject = this._docSkeletonManagerService.getCurrent();

                    if (docsSkeletonObject == null) {
                        return;
                    }

                    const { unitId, skeleton } = docsSkeletonObject;

                    if (commandUnitId !== unitId) {
                        return;
                    }

                    const currentRender = this._renderManagerService.getRenderById(unitId);

                    if (currentRender == null) {
                        return;
                    }

                    if (this._editorService.isEditor(unitId)) {
                        currentRender.mainComponent?.makeDirty();
                        return;
                    }

                    this._refreshDrawing(unitId, skeleton, currentRender);

                    // this.calculatePagePosition(currentRender);
                }
            })
        );
    }

    private _refreshDrawing(unitId: string, skeleton: DocumentSkeleton, currentRender: IRender) {
        const skeletonData = skeleton?.getSkeletonData();

        const { mainComponent, scene } = currentRender;

        const documentComponent = mainComponent as Documents;

        if (!skeletonData) {
            return;
        }

        const { left: docsLeft, top: docsTop, pageLayoutType, pageMarginLeft, pageMarginTop } = documentComponent;

        const { pages } = skeletonData;

        const floatObjects: any[] = []; // IFloatingObjectManagerParam

        const { scaleX, scaleY } = scene.getAncestorScale();

        this._liquid.reset();

        this._pageMarginCache.clear();

        // const objectList: BaseObject[] = [];
        // const pageMarginCache = new Map<string, { marginLeft: number; marginTop: number }>();

        // const cumPageLeft = 0;
        // const cumPageTop = 0;
        /**
         * TODO: @DR-Univer We should not refresh all floating elements, but instead make a diff.
         */
        for (let i = 0, len = pages.length; i < len; i++) {
            const page = pages[i];
            const { skeDrawings, marginLeft, marginTop } = page;
            // cumPageLeft + = pageWidth + documents.pageMarginLeft;

            this._liquid.translatePagePadding(page);

            skeDrawings.forEach((drawing) => {
                const { aLeft, aTop, height, width, drawingId, drawingOrigin } = drawing;
                const behindText = drawingOrigin.layoutType === PositionedObjectLayoutType.WRAP_NONE && drawingOrigin.behindDoc === BooleanNumber.TRUE;

                floatObjects.push({
                    unitId,
                    subUnitId: DEFAULT_DOCUMENT_SUB_COMPONENT_ID,
                    floatingObjectId: drawingId,
                    behindText,
                    floatingObject: {
                        left: aLeft + docsLeft + this._liquid.x,
                        top: aTop + docsTop + this._liquid.y,
                        width,
                        height,
                    },
                });

                this._pageMarginCache.set(drawingId, {
                    marginLeft: this._liquid.x,
                    marginTop: this._liquid.y,
                });
            });

            this._liquid.restorePagePadding(page);

            this._liquid.translatePage(page, pageLayoutType, pageMarginLeft, pageMarginTop);
        }

        // this._floatingObjectManagerService.batchAddOrUpdate(floatObjects);
    }
}
