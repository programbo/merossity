import { MerossCloudError, merossCloudLogin } from '../meross'
import {
  apiErr,
  apiOk,
  inferMfaRequired,
  nowIso,
  parseJsonBody,
  readConfig,
  summarizeCloud,
  writeConfig,
} from './shared'

export const createLoginCloudHandler = () => ({
  /**
   * Function: Authenticate against Meross cloud and persist credentials to config.
   * Input: POST JSON `{ email?, password?, mfaCode?, domain?, scheme?, timeoutMs? }`.
   * Output: `{ ok: true, data: { cloud } }` (redacted token details), or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const email = String(body.email ?? process.env.MEROSS_EMAIL ?? '')
    const password = String(body.password ?? process.env.MEROSS_PASSWORD ?? '')
    const mfaCode = body.mfaCode ? String(body.mfaCode) : undefined
    const domain = body.domain ? String(body.domain) : undefined
    const scheme = body.scheme === 'http' || body.scheme === 'https' ? (body.scheme as 'http' | 'https') : undefined
    const timeoutMs = body.timeoutMs !== undefined ? Number(body.timeoutMs) : undefined

    if (!email || !password) {
      return apiErr('Missing email/password (provide in request or set MEROSS_EMAIL/MEROSS_PASSWORD).', 'missing_creds')
    }

    try {
      const res = await merossCloudLogin(
        { email, password, mfaCode },
        { domain, scheme, timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined },
      )
      const cfg = await readConfig()
      await writeConfig({
        ...cfg,
        cloud: { ...res.creds, updatedAt: nowIso() },
      })
      return apiOk({ cloud: summarizeCloud(res.creds) })
    } catch (e) {
      if (inferMfaRequired(e)) {
        return apiErr(
          'MFA required. Provide a TOTP code and try again.',
          'mfa_required',
          e instanceof MerossCloudError ? { apiStatus: e.apiStatus, info: e.info } : undefined,
        )
      }
      if (e instanceof MerossCloudError) {
        return apiErr(e.message, 'cloud_error', { apiStatus: e.apiStatus, info: e.info })
      }
      return (apiErr(e instanceof Error ? e.message : String(e), 'unknown'), { status: 500 } as Response)
    }
  },
})
