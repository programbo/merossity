import type { StatePollerService } from './state-poller'

export const createGetEventsStreamHandler = (poller: StatePollerService) => ({
  /**
   * Function: Open an SSE stream for device-state and poller-health events.
   * Input: GET request with no body.
   * Output: `text/event-stream`.
   */
  async GET() {
    return poller.createStreamResponse()
  },
})

