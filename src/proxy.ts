import { type NextRequest, NextResponse } from "next/server";
import { decryptApiKey } from "@/lib/crypto-edge";

async function proxyToService(request: NextRequest, baseUrl: string, pathPrefix: string, serviceName: string): Promise<NextResponse> {
	try {
		const targetPath = request.nextUrl.pathname.replace(pathPrefix, "");
		const targetUrl = `${baseUrl}${targetPath}${request.nextUrl.search}`;

		const requestHeaders = new Headers(request.headers);

		["x-forwarded", "x-real-ip"].forEach((prefix) => {
			for (const key of [...requestHeaders.keys()]) {
				if (key.startsWith(prefix)) requestHeaders.delete(key);
			}
		});

		for (const h of ["host", "connection", "upgrade"]) {
			requestHeaders.delete(h);
		}

		let authorizationHeader: string | undefined;
		if (serviceName === "Kratos") {
			const kratosApiKeyEncrypted =
				process.env.KRATOS_API_KEY || request.cookies.get("kratos-api-key")?.value || request.headers.get("x-kratos-api-key") || undefined;
			if (kratosApiKeyEncrypted) {
				// Decrypt the API key (handles both encrypted and plain text values)
				const kratosApiKey = await decryptApiKey(kratosApiKeyEncrypted);
				if (kratosApiKey) {
					authorizationHeader = `Bearer ${kratosApiKey}`;
				}
			}
		} else if (serviceName === "Hydra") {
			const hydraApiKeyEncrypted =
				process.env.HYDRA_API_KEY || request.cookies.get("hydra-api-key")?.value || request.headers.get("x-hydra-api-key") || undefined;
			if (hydraApiKeyEncrypted) {
				// Decrypt the API key (handles both encrypted and plain text values)
				const hydraApiKey = await decryptApiKey(hydraApiKeyEncrypted);
				if (hydraApiKey) {
					authorizationHeader = `Bearer ${hydraApiKey}`;
				}
			}
		}

		if (authorizationHeader) {
			requestHeaders.set("Authorization", authorizationHeader);
		}

		const response = await fetch(targetUrl, {
			method: request.method,
			headers: requestHeaders,
			body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined,
		});

		// Handle different response types
		if (response.status === 204) {
			const responseHeaders = new Headers();
			response.headers.forEach((value, key) => {
				if (key.toLowerCase() !== "content-encoding" && key.toLowerCase() !== "transfer-encoding") {
					responseHeaders.set(key, value);
				}
			});

			return new NextResponse(null, {
				status: 204,
				headers: responseHeaders,
			});
		}

		// Handle successful responses with content
		const responseBody = await response.arrayBuffer();
		const responseHeaders = new Headers();

		// Copy response headers selectively to avoid Next.js Edge Runtime issues
		// The 'location' header from Ory Hydra's 201 responses causes "Invalid URL" TypeErrors
		// in the Edge Runtime, which then returns 500 errors to the frontend. We filter to only
		// include essential headers that are safe for the Edge Runtime to process.
		const safeHeaders = ["content-type", "cache-control", "etag", "last-modified", "vary", "link"];
		response.headers.forEach((value, key) => {
			const lowerKey = key.toLowerCase();
			// Only copy safe headers and custom x-* headers (excluding forwarding headers)
			if (safeHeaders.includes(lowerKey) || (lowerKey.startsWith("x-") && !lowerKey.startsWith("x-forwarded") && !lowerKey.startsWith("x-real-ip"))) {
				responseHeaders.set(key, value);
			}
		});

		return new NextResponse(responseBody, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
		});
	} catch (error) {
		console.error(`[Middleware] Failed to proxy ${request.nextUrl.pathname}:`, error);
		console.error(`[Middleware] Error details:`, {
			message: error instanceof Error ? error.message : "Unknown error",
			stack: error instanceof Error ? error.stack : undefined,
			name: error instanceof Error ? error.name : undefined,
		});

		// Handle fetch errors
		if (error instanceof TypeError && error.message.includes("fetch")) {
			return NextResponse.json(
				{
					error: "Network Error",
					message: error.message,
					details: `Unable to reach ${serviceName} at ${baseUrl}. Please check your ${serviceName} configuration.`,
				},
				{ status: 502 },
			);
		}

		return NextResponse.json(
			{
				error: "Proxy Error",
				message: error instanceof Error ? error.message : "Unknown error",
				details: `Failed to proxy request to ${serviceName} at ${baseUrl}`,
				errorType: error instanceof Error ? error.name : "Unknown",
			},
			{ status: 500 },
		);
	}
}

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// URL resolution priority: environment variable > cookie > header > default.
	// Environment variables always win so that values passed to the container
	// take effect immediately, without being shadowed by previously persisted cookies.

	// Handle Kratos public API proxying
	if (pathname.startsWith("/api/kratos/")) {
		const kratosPublicUrlRaw =
			process.env.KRATOS_PUBLIC_URL ||
			request.cookies.get("kratos-public-url")?.value ||
			request.headers.get("x-kratos-public-url") ||
			"http://localhost:4433";

		const kratosPublicUrl = decodeURIComponent(kratosPublicUrlRaw);
		return proxyToService(request, kratosPublicUrl, "/api/kratos", "Kratos");
	}

	// Handle Kratos admin API proxying
	if (pathname.startsWith("/api/kratos-admin/")) {
		const kratosAdminUrlRaw =
			process.env.KRATOS_ADMIN_URL ||
			request.cookies.get("kratos-admin-url")?.value ||
			request.headers.get("x-kratos-admin-url") ||
			"http://localhost:4434";

		const kratosAdminUrl = decodeURIComponent(kratosAdminUrlRaw);
		return proxyToService(request, kratosAdminUrl, "/api/kratos-admin", "Kratos");
	}

	// Handle Hydra public API proxying
	if (pathname.startsWith("/api/hydra/")) {
		const hydraPublicUrlRaw =
			process.env.HYDRA_PUBLIC_URL ||
			request.cookies.get("hydra-public-url")?.value ||
			request.headers.get("x-hydra-public-url") ||
			"http://localhost:4444";

		const hydraPublicUrl = decodeURIComponent(hydraPublicUrlRaw);
		return proxyToService(request, hydraPublicUrl, "/api/hydra", "Hydra");
	}

	// Handle Hydra admin API proxying
	if (pathname.startsWith("/api/hydra-admin/")) {
		const hydraAdminUrlRaw =
			process.env.HYDRA_ADMIN_URL ||
			request.cookies.get("hydra-admin-url")?.value ||
			request.headers.get("x-hydra-admin-url") ||
			"http://localhost:4445";

		const hydraAdminUrl = decodeURIComponent(hydraAdminUrlRaw);
		return proxyToService(request, hydraAdminUrl, "/api/hydra-admin", "Hydra");
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/api/kratos/:path*", "/api/kratos-admin/:path*", "/api/hydra/:path*", "/api/hydra-admin/:path*"],
};
