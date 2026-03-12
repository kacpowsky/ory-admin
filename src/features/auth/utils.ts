import { type AuthUser } from "./types";

/**
 * Check if user has admin role
 * @param user Auth user
 * @returns True if user is admin
 */
export const isAdmin = (user: AuthUser | null): boolean => {
	return user?.role === "admin";
};

/**
 * Check if user has viewer role or higher
 * @param user Auth user
 * @returns True if user can view content
 */
export const canView = (user: AuthUser | null): boolean => {
	return user?.role === "admin" || user?.role === "viewer";
};
