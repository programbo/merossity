import { defaultSuggestedCidr, suggestCidrs } from '../meross'
import { apiOk } from './shared'

export const createSuggestLanCidrHandler = () => ({
  /**
   * Function: Suggest likely LAN CIDR ranges and return a default choice.
   * Input: GET request with no body.
   * Output: `{ ok: true, data: { suggestions: string[], default: string } }`.
   */
  async GET() {
    return apiOk({ suggestions: suggestCidrs(), default: defaultSuggestedCidr() })
  },
})
