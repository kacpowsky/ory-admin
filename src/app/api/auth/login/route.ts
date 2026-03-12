import { NextResponse } from "next/server";
import { UserRole } from "@/features/auth/types";

/**
 * Login: validates against ADMIN_PASSWORD and VIEWER_PASSWORD env vars.
 * Set ADMIN_PASSWORD to enable login as user "admin".
 * Set VIEWER_PASSWORD to enable login as user "viewer".
 */
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { username, password } = body as { username?: string; password?: string };

		if (typeof username !== "string" || typeof password !== "string" || !username.trim()) {
			return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
		}

		const adminPassword = process.env.ADMIN_PASSWORD;
		const viewerPassword = process.env.VIEWER_PASSWORD;

		if (username === "admin" && adminPassword !== undefined && adminPassword !== "" && password === adminPassword) {
			return NextResponse.json({
				user: {
					username: "admin",
					role: UserRole.ADMIN,
					displayName: "Administrator",
					email: "admin@example.com",
				},
			});
		}

		if (username === "viewer" && viewerPassword !== undefined && viewerPassword !== "" && password === viewerPassword) {
			return NextResponse.json({
				user: {
					username: "viewer",
					role: UserRole.VIEWER,
					displayName: "Viewer User",
					email: "viewer@example.com",
				},
			});
		}

		return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
	} catch {
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
}
