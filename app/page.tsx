import { OperationalWorkspace } from "@/components/operational-workspace";
import {
  chatGPTSignOutPath,
  requireChatGPTUser,
} from "@/app/chatgpt-auth";
import { actor } from "@/lib/server-data";
import { AccessDeniedError } from "@/lib/authz";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  try {
    if ((await actor()).kind === "CLIENT") redirect("/client");
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return (
        <main className="access-denied-page">
          <section
            className="access-denied-panel"
            aria-labelledby="access-title"
          >
            <p className="eyebrow">CONTROLLED ACCESS</p>
            <h1 id="access-title">Your account is not assigned to Clarity IE</h1>
            <p>
              You are signed in as <strong>{user.email}</strong>, but this account
              does not yet have a practice or client-portal role. Ask a practice
              administrator to add the account in Administration &gt; Access &amp;
              roles.
            </p>
            <a className="primary" href={chatGPTSignOutPath("/")}>
              Sign in with another account
            </a>
          </section>
        </main>
      );
    }
    console.error("Unable to authorise the Clarity IE workspace", error);
    throw error;
  }
  return <OperationalWorkspace />;
}
