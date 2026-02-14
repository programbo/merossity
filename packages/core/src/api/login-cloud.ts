import crypto from 'node:crypto'
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
   * Input: POST JSON `{ email, password, mfaCode?, domain?, scheme?, timeoutMs? }`.
   * Output: `{ ok: true, data: { cloud } }` (redacted token details), or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const email = String(body.email ?? '')
    const password = String(body.password ?? '')
    const mfaCode = body.mfaCode ? String(body.mfaCode) : undefined
    const domain = body.domain ? String(body.domain) : undefined
    const scheme = body.scheme === 'http' || body.scheme === 'https' ? (body.scheme as 'http' | 'https') : undefined
    const timeoutMs = body.timeoutMs !== undefined ? Number(body.timeoutMs) : undefined
    const authDebugRaw = String(process.env.MEROSS_DEBUG_AUTH ?? '')
      .trim()
      .toLowerCase()
    const authDebug = authDebugRaw !== '' && authDebugRaw !== '0' && authDebugRaw !== 'false' && authDebugRaw !== 'off'
    const debugVerbose = authDebugRaw === '2' || authDebugRaw === 'verbose' || authDebugRaw === 'debug'
    const requestId = crypto.randomUUID().slice(0, 8)

    if (authDebug) {
      console.log('[auth-debug] /api/cloud/login request body', {
        requestId,
        email,
        password,
        mfaCode,
        passwordLength: password.length,
        mfaLength: mfaCode?.length ?? 0,
      })
      if (debugVerbose) {
        console.log('[auth-debug] /api/cloud/login request options', {
          requestId,
          domain,
          scheme,
          timeoutMs,
        })
      }
    }

    if (!email || !password) {
      return apiErr('Missing email/password in request body.', 'missing_creds')
    }

    const startedAt = Date.now()
    try {
      const res = await merossCloudLogin(
        { email, password, mfaCode },
        { domain, scheme, timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined },
      )
      if (authDebug) {
        console.log('[auth-debug] /api/cloud/login success', {
          requestId,
          elapsedMs: Date.now() - startedAt,
          resolvedDomain: res.creds.domain,
          userId: res.creds.userId,
        })
      }
      const cfg = await readConfig()
      await writeConfig({
        ...cfg,
        cloud: { ...res.creds, updatedAt: nowIso() },
      })
      return apiOk({ cloud: summarizeCloud(res.creds) })
    } catch (e) {
      if (inferMfaRequired(e)) {
        if (authDebug) {
          console.log('[auth-debug] /api/cloud/login failure:mfa_required', {
            requestId,
            elapsedMs: Date.now() - startedAt,
            error: e instanceof Error ? e.message : String(e),
          })
        }
        return apiErr(
          'MFA required. Provide a TOTP code and try again.',
          'mfa_required',
          e instanceof MerossCloudError ? { apiStatus: e.apiStatus, info: e.info } : undefined,
        )
      }
      if (e instanceof MerossCloudError) {
        if (authDebug) {
          console.log('[auth-debug] /api/cloud/login failure:cloud_error', {
            requestId,
            elapsedMs: Date.now() - startedAt,
            message: e.message,
            apiStatus: e.apiStatus,
            info: e.info,
          })
        }
        return apiErr(e.message, 'cloud_error', { apiStatus: e.apiStatus, info: e.info })
      }
      if (authDebug) {
        console.log('[auth-debug] /api/cloud/login failure:unknown', {
          requestId,
          elapsedMs: Date.now() - startedAt,
          error: e instanceof Error ? e.message : String(e),
        })
      }
      return apiErr(e instanceof Error ? e.message : String(e), 'unknown', undefined, { status: 500 })
    }
  },
})
