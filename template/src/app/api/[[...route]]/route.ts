import { app } from "@server/api/index";
import { handle } from "hono/vercel";

// OpenNext runs Next.js in the Node.js runtime on Workers (nodejs_compat),
// which is where the D1 binding and Hono handlers execute.
export const runtime = "nodejs";

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
