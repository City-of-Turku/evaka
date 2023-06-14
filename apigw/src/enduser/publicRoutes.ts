// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { Router } from 'express'
import { appCommit } from '../shared/config.js'
import { createProxy } from '../shared/proxy-utils.js'

const router = Router()
const proxy = createProxy()

router.get('/version', (_, res) => {
  res.send({ commitId: appCommit })
})
router.get('/units', proxy) // deprecated
router.get('/public/units', proxy)
router.get('/public/units/*', proxy)
router.get('/public/club-terms', proxy)
router.get('/public/preschool-terms', proxy)
router.get('/public/service-needs/options', proxy)

export default router
