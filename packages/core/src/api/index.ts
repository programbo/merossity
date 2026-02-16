import { createDiscoverHostsHandler } from './discover-hosts'
import { createGetCloudCredsHandler } from './get-cloud-creds'
import { createGetCloudDevicesHandler } from './get-cloud-devices'
import { createGetDeviceConsumptionXHandler } from './get-device-consumptionx'
import { createGetDeviceElectricityHandler } from './get-device-electricity'
import { createGetDeviceStateHandler } from './get-device-state'
import { createGetDeviceStatesHandler } from './get-device-states'
import { createGetDeviceSystemAllHandler } from './get-device-system-all'
import { createGetDeviceTimerXHandler } from './get-device-timerx'
import { createGetDeviceTriggerXHandler } from './get-device-triggerx'
import { createSetDeviceTimerXHandler } from './set-device-timerx'
import { createDeleteDeviceTimerXHandler } from './delete-device-timerx'
import { createGetEventsStatusHandler } from './get-events-status'
import { createGetEventsStreamHandler } from './get-events-stream'
import { createGetHostsHandler } from './get-hosts'
import { createGetStatusHandler } from './get-status'
import { createGetTelemetryPowerCurrentHandler } from './get-telemetry-power-current'
import { createGetTelemetryPowerHistoryHandler } from './get-telemetry-power-history'
import { createLoginCloudHandler } from './login-cloud'
import { createNetworkCidrHandler } from './network-cidr'
import { createPatchDeviceTimerXHandler } from './patch-device-timerx'
import { createRefreshCloudDevicesHandler } from './refresh-cloud-devices'
import { createResolveHostHandler } from './resolve-host'
import { createSetDeviceLightHandler } from './set-device-light'
import { createSetDeviceTriggerXHandler } from './set-device-triggerx'
import { createDeleteDeviceTriggerXHandler } from './delete-device-triggerx'
import { getStatePollerService } from './state-poller'
import { createSuggestLanCidrHandler } from './suggest-lan-cidr'
import { createToggleDeviceHandler } from './toggle-device'
import type { ApiRoutes } from './types'

export type { ApiRouteDeps, ApiRouteHandler, ApiRoutes } from './types'

export const createApiRoutes = (): ApiRoutes => {
  const statePoller = getStatePollerService()
  const suggestLanCidr = createSuggestLanCidrHandler()
  const getStatus = createGetStatusHandler()
  const loginCloud = createLoginCloudHandler()
  const getCloudCreds = createGetCloudCredsHandler()
  const getCloudDevices = createGetCloudDevicesHandler()
  const refreshCloudDevices = createRefreshCloudDevicesHandler()
  const getHosts = createGetHostsHandler()
  const resolveHost = createResolveHostHandler()
  const discoverHosts = createDiscoverHostsHandler()
  const networkCidr = createNetworkCidrHandler()
  const getDeviceSystemAll = createGetDeviceSystemAllHandler()
  const getDeviceElectricity = createGetDeviceElectricityHandler()
  const getDeviceConsumptionX = createGetDeviceConsumptionXHandler()
  const getDeviceState = createGetDeviceStateHandler(statePoller)
  const getDeviceStates = createGetDeviceStatesHandler(statePoller)
  const toggleDevice = createToggleDeviceHandler(statePoller)
  const setDeviceLight = createSetDeviceLightHandler(statePoller)
  const getDeviceTimerX = createGetDeviceTimerXHandler()
  const patchDeviceTimerX = createPatchDeviceTimerXHandler(statePoller)
  const getDeviceTriggerX = createGetDeviceTriggerXHandler()
  const setDeviceTimerX = createSetDeviceTimerXHandler(statePoller)
  const deleteDeviceTimerX = createDeleteDeviceTimerXHandler(statePoller)
  const setDeviceTriggerX = createSetDeviceTriggerXHandler(statePoller)
  const deleteDeviceTriggerX = createDeleteDeviceTriggerXHandler(statePoller)
  const eventsStream = createGetEventsStreamHandler(statePoller)
  const eventsStatus = createGetEventsStatusHandler(statePoller)
  const telemetryPowerCurrent = createGetTelemetryPowerCurrentHandler()
  const telemetryPowerHistory = createGetTelemetryPowerHistoryHandler()

  return {
    '/api/lan/cidr-suggest': suggestLanCidr,

    '/api/status': getStatus,
    '/api/cloud/login': loginCloud,
    '/api/cloud/creds': getCloudCreds,
    '/api/cloud/devices': getCloudDevices,
    '/api/cloud/devices/refresh': refreshCloudDevices,
    '/api/hosts': getHosts,
    '/api/hosts/resolve': resolveHost,
    '/api/hosts/discover': discoverHosts,
    '/api/network/cidr': networkCidr,

    '/api/device/system-all': getDeviceSystemAll,
    '/api/device/electricity': getDeviceElectricity,
    '/api/device/consumptionx': getDeviceConsumptionX,
    '/api/device/state': getDeviceState,
    '/api/device/states': getDeviceStates,
    '/api/device/toggle': toggleDevice,
    '/api/device/light': setDeviceLight,
    '/api/device/timerx/list': getDeviceTimerX,
    '/api/device/timerx/patch': patchDeviceTimerX,
    '/api/device/timerx/set': setDeviceTimerX,
    '/api/device/timerx/delete': deleteDeviceTimerX,
    '/api/device/triggerx/list': getDeviceTriggerX,
    '/api/device/triggerx/set': setDeviceTriggerX,
    '/api/device/triggerx/delete': deleteDeviceTriggerX,
    '/api/events/stream': eventsStream,
    '/api/events/status': eventsStatus,

    '/api/telemetry/power/current': telemetryPowerCurrent,
    '/api/telemetry/power/history': telemetryPowerHistory,
  }
}

export { applySecurityHeaders } from './applySecurityHeaders'
