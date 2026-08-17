import { getAuth } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ path: string[] }> };
const unavailable = () => Response.json({ error: "Authentication is unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
async function selfRegistration(context: RouteContext) { return (await context.params).path[0] === "sign-up"; }
export async function GET(request: Request, context: RouteContext) { const auth = await getAuth(); return auth ? auth.handler().GET(request, context) : unavailable(); }
export async function POST(request: Request, context: RouteContext) { if (await selfRegistration(context)) return Response.json({ error: "Self-registration is disabled." }, { status: 403 }); const auth = await getAuth(); return auth ? auth.handler().POST(request, context) : unavailable(); }
export async function PUT(request: Request, context: RouteContext) { const auth = await getAuth(); return auth ? auth.handler().PUT(request, context) : unavailable(); }
export async function PATCH(request: Request, context: RouteContext) { const auth = await getAuth(); return auth ? auth.handler().PATCH(request, context) : unavailable(); }
export async function DELETE(request: Request, context: RouteContext) { const auth = await getAuth(); return auth ? auth.handler().DELETE(request, context) : unavailable(); }

