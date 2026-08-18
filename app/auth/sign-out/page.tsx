"use client";

import { Button, Card, Spinner, Title2 } from "@fluentui/react-components";
import { ArrowClockwise20Regular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth/client";

export default function SignOutPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("return_to") || "/";
    const returnTo = value.startsWith("/") && !value.startsWith("//") ? value : "/";
    void getAuthClient()
      .then((client) => client.signOut())
      .then(({ error }) => error ? setFailed(true) : window.location.replace(returnTo))
      .catch(() => setFailed(true));
  }, []);
  return (
    <main className="access-denied-page">
      <Card className="access-denied-panel">
        {!failed ? <Spinner size="large" labelPosition="below" label="Signing you out…" /> : <>
          <Title2 as="h1">Sign out needs attention</Title2>
          <Button appearance="primary" icon={<ArrowClockwise20Regular />} onClick={() => window.location.reload()}>Try again</Button>
        </>}
      </Card>
    </main>
  );
}
