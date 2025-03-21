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

import type { ICommand } from '@univerjs/core';
import {
    CommandType,
    ICommandService,
    IUndoRedoService,
} from '@univerjs/core';

import { DocDrawingApplyType, IDocDrawingService, SetDocDrawingApplyMutation } from '@univerjs/docs';
import type { IAccessor } from '@wendellhu/redi';
import type { IDrawingJsonUndo1 } from '@univerjs/drawing';
import { ClearDocDrawingTransformerOperation } from '../operations/clear-drawing-transformer.operation';
import type { IInsertDrawingCommandParams } from './interfaces';

/**
 * The command to insert new defined name
 */
export const InsertDocDrawingCommand: ICommand = {
    id: 'doc.command.insert-doc-image',
    type: CommandType.COMMAND,
    handler: (accessor: IAccessor, params?: IInsertDrawingCommandParams) => {
        const commandService = accessor.get(ICommandService);
        const undoRedoService = accessor.get(IUndoRedoService);
        const docDrawingService = accessor.get(IDocDrawingService);

        if (!params) return false;

        // const { drawingParam, imageParam } = params;

        const drawings = params.drawings;

        // const sheetDrawingParams = drawings.map((param) => param.sheetDrawingParam);
        const unitIds: string[] = drawings.map((param) => param.unitId);

        // execute do mutations and add undo mutations to undo stack if completed
        const jsonOp = docDrawingService.getBatchAddOp(drawings) as IDrawingJsonUndo1;

        const { unitId, subUnitId, undo, redo, objects } = jsonOp;

        const result = commandService.syncExecuteCommand(SetDocDrawingApplyMutation.id, { op: redo, unitId, subUnitId, objects, type: DocDrawingApplyType.INSERT });

        if (result) {
            undoRedoService.pushUndoRedo({
                unitID: unitId,
                undoMutations: [
                    { id: SetDocDrawingApplyMutation.id, params: { op: undo, unitId, subUnitId, objects, type: DocDrawingApplyType.REMOVE } },
                    { id: ClearDocDrawingTransformerOperation.id, params: unitIds },
                ],
                redoMutations: [
                    { id: SetDocDrawingApplyMutation.id, params: { op: redo, unitId, subUnitId, objects, type: DocDrawingApplyType.INSERT } },
                    { id: ClearDocDrawingTransformerOperation.id, params: unitIds },
                ],
            });

            return true;
        }

        return false;
    },
};
