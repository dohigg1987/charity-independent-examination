import { ClientPortal } from "@/components/client-portal";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AccessDeniedError } from "@/lib/authz";
import { actor } from "@/lib/server-data";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientPage() {
  await requireChatGPTUser("/client");
  let principal;
  try {
    principal = await actor();
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/");
    throw error;
  }
  return <ClientPortal previewMode={principal.kind === "INTERNAL"} />;
}
