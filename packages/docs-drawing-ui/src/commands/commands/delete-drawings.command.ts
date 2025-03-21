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

import { CommandType, type ICommand, ICommandService } from '@univerjs/core';
import type { IAccessor } from '@wendellhu/redi';
import type { IDocDrawing } from '@univerjs/docs';
import { IDocDrawingService } from '@univerjs/docs';
import { RemoveDocDrawingCommand } from './remove-doc-drawing.command';
import type { IDeleteDrawingCommandParams } from './interfaces';

export const DeleteDocDrawingsCommand: ICommand = {
    id: 'doc.command.delete-drawing',
    type: CommandType.COMMAND,
    handler: (accessor: IAccessor) => {
        const commandService = accessor.get(ICommandService);
        const docDrawingService = accessor.get(IDocDrawingService);

        const drawings = docDrawingService.getFocusDrawings();

        if (drawings.length === 0) {
            return false;
        }

        const unitId = drawings[0].unitId;

        const newDrawings = drawings.map((drawing) => {
            const { unitId, subUnitId, drawingId, drawingType } = drawing as IDocDrawing;

            return {
                unitId,
                subUnitId,
                drawingId,
                drawingType,
            };
        });
        return commandService.executeCommand<IDeleteDrawingCommandParams>(RemoveDocDrawingCommand.id, {
            unitId,
            drawings: newDrawings,
        });
    },
};
