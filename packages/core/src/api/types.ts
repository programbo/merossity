export type JsonResponder = (data: unknown, init?: ResponseInit) => Response

export type ApiRouteMethod = (req: Request) => Response | Promise<Response>

export type ApiRouteHandler = {
  GET?: ApiRouteMethod
  POST?: ApiRouteMethod
}

export type ApiRoutes = Record<string, ApiRouteHandler>

export type ApiRouteDeps = {
  json: JsonResponder
}
