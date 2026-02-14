import { apiOk } from './shared'
import type { StatePollerService } from './state-poller'

export const createGetEventsStatusHandler = (poller: StatePollerService) => ({
  /**
   * Function: Return current server poller/SSE status metrics.
   * Input: GET request with no body.
   * Output: `{ ok: true, data: PollerStats & { activeClients } }`.
   */
  async GET() {
    return apiOk(poller.getStatus())
  },
})

