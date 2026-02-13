# devicesMachine State Chart Diagram

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> refreshingCloud: REFRESH
    idle --> suggestingCidr: SCAN<br/>(needsCidrSuggest guard)
    idle --> discoveringHosts: SCAN<br/>(has CIDR)
    idle --> resolving: device_RESOLVE
    idle --> toggling: device_TOGGLE<br/>(hasHost guard)
    idle --> fetchingState: device_REFRESH_STATE
    idle --> fetchingDiagnostics: device_DIAGNOSTICS<br/>(hasHost guard)

    refreshingCloud --> idle: onDone<br/>(setDevices)
    refreshingCloud --> idle: onError

    suggestingCidr --> discoveringHosts: onDone<br/>(setCidrIfEmpty)
    suggestingCidr --> discoveringHosts: onError

    discoveringHosts --> idle: onDone<br/>(setHosts)
    discoveringHosts --> idle: onError

    resolving --> idle: onDone<br/>(setHosts + clearActiveOperation)
    resolving --> idle: onError<br/>(clearActiveOperation)

    toggling --> idle: onDone<br/>(clearActiveOperation)
    toggling --> idle: onError<br/>(setDeviceError + clearActiveOperation)

    fetchingState --> idle: onDone<br/>(clearDeviceError + setDeviceState + clearActiveOperation)
    fetchingState --> idle: onError<br/>(setDeviceError + clearActiveOperation)

    fetchingDiagnostics --> idle: onDone<br/>(setSystemDump + clearActiveOperation)
    fetchingDiagnostics --> idle: onError<br/>(clearActiveOperation)

    note right of idle
        Global Events (always handled):
        - SET_CIDR → setCidr action
        - CLOSE_SYSTEM_DUMP → setSystemDump(null)
    end note

    note right of refreshingCloud
        Actor: refreshFromCloud
        API: POST /api/cloud/devices/refresh
        Output: { count, list: MerossCloudDevice[] }
    end note

    note right of suggestingCidr
        Actor: suggestCidr
        API: GET /api/lan/cidr-suggest
        Output: { suggestions, default }
    end note

    note right of discoveringHosts
        Actor: discoverHosts
        Entry: persistCidr (localStorage)
        API: POST /api/hosts/discover
        Output: { cidr, count, hosts, hostsAll }
    end note

    note right of resolving
        Actor: resolveHost
        Entry: setActiveOperation(resolving)
        API: POST /api/hosts/resolve
        Input: { uuid, mac, cidr }
    end note

    note right of toggling
        Actor: toggleDevice
        Entry: setActiveOperation(toggling)
        API: POST /api/device/toggle
        Input: { uuid, channel, onoff }
    end note

    note right of fetchingState
        Actor: fetchDeviceState
        Entry: setActiveOperation(fetchingState)
        API: POST /api/device/state
        Output: { host, channel, onoff, channels }
    end note

    note right of fetchingDiagnostics
        Actor: fetchDiagnostics
        Entry: setActiveOperation(fetchingDiagnostics)
        API: POST /api/device/system-all
        Output: { host, data: unknown }
    end note
```

## Machine Context Structure

```typescript
type DevicesContext = {
  devices: MerossCloudDevice[]      // Cloud device list
  hosts: HostsMap                     // Discovered LAN hosts
  cidr: string                        // Network CIDR range
  deviceStates: Record<string, DeviceState>  // Per-device state cache
  systemDump: SystemDump | null       // Diagnostics data
  activeOperation: ActiveOperation    // Currently running operation
}
```

## Guards

| Guard | Purpose |
|-------|---------|
| `needsCidrSuggest` | Returns true if CIDR is empty/whitespace |
| `hasHost(uuid)` | Returns true if device has a known host in `hosts[uuid]` |
| `isActiveOperationFor(uuid, operationType)` | Returns true if operation is active for device |

## Actions

| Action | Purpose |
|--------|---------|
| `setDevices` | Update `devices` array from cloud |
| `setHosts` | Update `hosts` map from discovery |
| `setCidr` | Update `cidr` string |
| `setCidrIfEmpty` | Set CIDR only if current is empty |
| `persistCidr` | Save CIDR to localStorage |
| `setActiveOperation` | Mark operation as active for device |
| `clearActiveOperation` | Clear active operation flag |
| `setDeviceState` | Update state cache for device |
| `clearDeviceError` | Remove error from device state |
| `setDeviceError` | Set error message on device state |
| `setSystemDump` | Update system dump data |

## Events Reference

| Event | Payload | Target States |
|-------|----------|--------------|
| `REFRESH` | - | `refreshingCloud` |
| `SCAN` | - | `suggestingCidr` (if needs CIDR) or `discoveringHosts` |
| `SET_CIDR` | `{ cidr: string }` | Global (no transition) |
| `device_RESOLVE` | `{ uuid, mac, title }` | `resolving` |
| `device_TOGGLE` | `{ uuid, onoff: 0\|1 }` | `toggling` (if has host) |
| `device_REFRESH_STATE` | `{ uuid }` | `fetchingState` |
| `device_DIAGNOSTICS` | `{ uuid }` | `fetchingDiagnostics` (if has host) |
| `CLOSE_SYSTEM_DUMP` | - | Global (no transition) |
