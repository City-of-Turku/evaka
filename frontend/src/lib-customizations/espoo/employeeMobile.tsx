// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type { EmployeeMobileCustomizations } from 'lib-customizations/types'

import { employeeMobileConfig } from './appConfigs'

const customizations: EmployeeMobileCustomizations = {
  appConfig: employeeMobileConfig,
  translations: {
    fi: {}
  }
}

export default customizations
