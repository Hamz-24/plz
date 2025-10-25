// middleware.ts
import { NextResponse } from "next/server";

// This middleware runs before every /api/ route
export function middleware(request: Request) {
    // Create a response that continues the request
    const response = NextResponse.next();

    // ✅ Add CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // If this is a preflight (OPTIONS) request, respond immediately
    if (request.method === "OPTIONS") {
        return new NextResponse(null, { status: 204, headers: response.headers });
    }

    return response;
}

// ✅ Only match API routes (to avoid interfering with your frontend)
export const config = {
    matcher: ["/api/:path*"],
};
