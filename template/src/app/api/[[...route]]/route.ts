import { app } from "@server/api/index";
import { handle } from "hono/vercel";

// better-sqlite3 is a native addon; force the Node.js runtime.
export const runtime = "nodejs";

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
