# devicesMachine State Chart Diagram

```mermaid
stateDiagram-v2
    [*] --> inventory
    [*] --> operations
    [*] --> monitor

    state inventory {
      [*] --> idle
      idle --> refreshingCloud: REFRESH
      idle --> suggestingCidr: SCAN (needsCidrSuggest)
      idle --> discoveringHosts: SCAN (has CIDR)
      refreshingCloud --> idle: onDone / onError
      suggestingCidr --> discoveringHosts: onDone / onError
      discoveringHosts --> idle: onDone / onError
    }

    state operations {
      [*] --> idle
      idle --> resolving: device_RESOLVE
      idle --> toggling: device_TOGGLE (hasHost)
      idle --> fetchingDiagnostics: device_DIAGNOSTICS (hasHost)
      resolving --> idle: onDone / onError
      toggling --> idle: onDone / onError
      fetchingDiagnostics --> idle: onDone / onError
    }

    state monitor {
      [*] --> connecting
      connecting --> live: monitor_STREAM_CONNECTED
      connecting --> degraded: monitor_STREAM_DISCONNECTED
      live --> degraded: monitor_STREAM_DISCONNECTED
      degraded --> live: monitor_STREAM_CONNECTED
    }

    note right of monitor
      Actor: streamEvents (EventSource /api/events/stream)
      Events consumed globally:
      - monitor_SNAPSHOT
      - monitor_STATE_RECEIVED
      - monitor_DEVICE_STALE
    end note

    note right of operations
      Manual refresh no longer enters a blocking state.
      device_REFRESH_STATE / monitor_REQUEST_REFRESH
      trigger POST /api/device/states and wait for SSE updates.
    end note
```

## Machine Context Structure

```typescript
type DevicesContext = {
  devices: MerossCloudDevice[]
  hosts: HostsMap
  cidr: string
  deviceStates: Record<string, DeviceState>
  systemDump: SystemDump | null
  activeDeviceUuid: string | null
  toggleRollback: { uuid: string; previous: DeviceState | null } | null
}
```

## Events Reference

| Event | Payload | Notes |
|-------|----------|-------|
| `REFRESH` | - | Refresh cloud inventory and hosts |
| `SCAN` | - | Discover LAN hosts |
| `SET_CIDR` | `{ cidr: string }` | Persists local + server CIDR |
| `device_RESOLVE` | `{ uuid, mac, title }` | Resolve host by MAC/scan |
| `device_TOGGLE` | `{ uuid, onoff: 0\|1 }` | Optimistic toggle + LAN command |
| `device_REFRESH_STATE` | `{ uuid }` | Immediate poll request (non-blocking) |
| `monitor_REQUEST_REFRESH` | `{ uuid }` | Same as manual refresh trigger |
| `monitor_SNAPSHOT` | `{ states }` | Initial SSE snapshot merge |
| `monitor_STATE_RECEIVED` | `{ state }` | Incremental SSE state update |
| `monitor_DEVICE_STALE` | `{ state }` | SSE stale/failure state update |
| `device_DIAGNOSTICS` | `{ uuid }` | Fetch `Appliance.System.All` dump |
| `CLOSE_SYSTEM_DUMP` | - | Clear diagnostics modal |
