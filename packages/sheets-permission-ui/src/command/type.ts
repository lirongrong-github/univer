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

import type { IRangeProtectionRule, IWorksheetProtectionRule } from '@univerjs/sheets';
import type { IPermissionPanelRule } from '../service/sheet-permission-panel.model';

export interface IAddRangeProtectionParams {
    permissionId: string;
    rule: IRangeProtectionRule;
}

export type ISetRangeProtectionParams = IAddRangeProtectionParams;

export interface IDeleteRangeProtectionParams {
    unitId: string;
    subUnitId: string;
    rule: IRangeProtectionRule;
}

export interface IAddWorksheetProtectionParams {
    unitId: string;
    rule: IWorksheetProtectionRule;
}

export interface IDeleteWorksheetProtectionParams {
    unitId: string;
    subUnitId: string;
    rule: IWorksheetProtectionRule;
}

export interface ISetWorksheetProtectionParams {
    permissionId: string;
    rule: IWorksheetProtectionRule;
}

export interface ISetProtectionParams {
    rule: IPermissionPanelRule;
}
