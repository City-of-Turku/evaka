// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import 'lib-common/assets/fonts/fonts.css'
import * as Sentry from '@sentry/browser'
import {
  Chart,
  defaults,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { polyfill as smoothScrollPolyfill } from 'seamless-scroll-polyfill'

import { appVersion } from 'lib-common/globals'
import { sentryEventFilter } from 'lib-common/sentry'
import { getEnvironment } from 'lib-common/utils/helpers'
import colors from 'lib-customizations/common'
import { appConfig } from 'lib-customizations/employee'

import { Root } from './router'
import 'chartjs-adapter-date-fns'
import './index.css'

// Load Sentry before React to make Sentry's integrations work automatically
Sentry.init({
  enabled: appConfig.sentry?.enabled === true,
  dsn: appConfig.sentry?.dsn,
  release: appVersion,
  environment: getEnvironment()
})
Sentry.getGlobalScope().addEventProcessor(sentryEventFilter)

// Smooth-scrolling requires polyfilling in Safari:
// https://caniuse.com/mdn-api_window_scroll_options_behavior_parameter
smoothScrollPolyfill()

Chart.register(
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  annotationPlugin
)
Chart.defaults.animation = false
Chart.defaults.font = {
  family: '"Open Sans", "Arial", sans-serif',
  ...defaults.font
}
Chart.defaults.color = colors.grayscale.g100

const root = createRoot(document.getElementById('app')!)
root.render(<Root />)

// Let the HTML template inline script know we have loaded successfully
if (!window.evaka) {
  window.evaka = {}
}
