import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";

export type ChatGPTUser = { id: string; displayName: string; email: string; fullName: string | null };
const SIGN_IN_PATH = "/auth/sign-in";
const SIGN_OUT_PATH = "/auth/sign-out";

/** Compatibility name retained while the independent deployment moves off Sites identity headers. */
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const auth = await getAuth();
  if (!auth) return null;
  const { data: session } = await auth.getSession();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.user || !email) return null;
  const fullName = session.user.name?.trim() || null;
  return { id: session.user.id, displayName: fullName ?? email, email, fullName };
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  if (process.env.NODE_ENV !== "production") return { id: "development", displayName: "Development examiner", email: "preview@clarity.ie", fullName: "Development examiner" };
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}
export function chatGPTSignOutPath(returnTo = "/"): string {
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}
export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://clarity.invalid");
    if (url.origin !== "https://clarity.invalid" || url.pathname.startsWith("/auth/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}

