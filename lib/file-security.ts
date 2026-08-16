export class RequestSecurityError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestSecurityError";
    this.status = status;
  }
}

type SignatureRule = {
  mime: string;
  extensions: string[];
  matches: (bytes: Uint8Array) => boolean;
};

const signatures: SignatureRule[] = [
  {
    mime: "application/pdf",
    extensions: ["pdf"],
    matches: (bytes) => starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  },
  {
    mime: "image/png",
    extensions: ["png"],
    matches: (bytes) =>
      starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: "image/jpeg",
    extensions: ["jpg", "jpeg"],
    matches: (bytes) => starts(bytes, [0xff, 0xd8, 0xff]),
  },
  {
    mime: "text/csv",
    extensions: ["csv"],
    matches: (bytes) => !bytes.slice(0, 512).some((value) => value === 0),
  },
  {
    mime: "application/vnd.ms-excel",
    extensions: ["csv"],
    matches: (bytes) => !bytes.slice(0, 512).some((value) => value === 0),
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    matches: (bytes) => starts(bytes, [0x50, 0x4b, 0x03, 0x04]),
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: ["xlsx"],
    matches: (bytes) => starts(bytes, [0x50, 0x4b, 0x03, 0x04]),
  },
];

export function verifyFile(
  file: File,
  bytes: ArrayBuffer,
): { mimeType: string; extension: string } {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const rule = signatures.find(
    (candidate) =>
      candidate.mime === file.type && candidate.extensions.includes(extension),
  );
  if (!rule || !rule.matches(new Uint8Array(bytes))) {
    throw new RequestSecurityError(
      "The file extension, content type and file signature do not agree",
      400,
    );
  }
  return { mimeType: rule.mime, extension };
}

export function safeDownloadName(value: string): string {
  return (
    value
      .replace(/[\r\n"\\/]/g, "_")
      .replace(/[^a-zA-Z0-9._ ()-]/g, "_")
      .slice(0, 180) || "document"
  );
}

export function securityHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; connect-src 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function starts(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}
