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

import type { BooleanNumber, IMutation } from '@univerjs/core';
import { CommandType, IUniverInstanceService } from '@univerjs/core';
import type { IAccessor } from '@wendellhu/redi';

export interface ISetWorksheetHideMutationParams {
    hidden: BooleanNumber;
    workbookId: string;
    worksheetId: string;
}

export const SetWorksheetHideMutationFactory = (
    accessor: IAccessor,
    params: ISetWorksheetHideMutationParams
): ISetWorksheetHideMutationParams => {
    const universheet = accessor.get(IUniverInstanceService).getCurrentUniverSheetInstance();
    const worksheet = universheet.getSheetBySheetId(params.worksheetId);
    if (worksheet == null) {
        throw new Error('worksheet is null error!');
    }
    return {
        hidden: worksheet.isSheetHidden(),
        workbookId: params.workbookId,
        worksheetId: worksheet.getSheetId(),
    };
};

export const SetWorksheetHideMutation: IMutation<ISetWorksheetHideMutationParams> = {
    id: 'sheet.mutation.set-worksheet-hidden',
    type: CommandType.MUTATION,
    handler: (accessor, params) => {
        const universheet = accessor.get(IUniverInstanceService).getUniverSheetInstance(params.workbookId);

        if (universheet == null) {
            return false;
        }

        const worksheet = universheet.getSheetBySheetId(params.worksheetId);

        if (!worksheet) {
            return false;
        }

        worksheet.getConfig().hidden = params.hidden;

        return true;
    },
};
