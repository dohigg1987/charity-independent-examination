import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestSecurityError,
  safeDownloadName,
  securityHeaders,
  verifyFile,
} from "../lib/file-security";

test("valid PDF signatures are accepted", () => {
  const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]).buffer;
  assert.equal(
    verifyFile(
      new File([bytes], "evidence.pdf", { type: "application/pdf" }),
      bytes,
    ).extension,
    "pdf",
  );
});

test("extension and signature mismatches are rejected", () => {
  const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer;
  assert.throws(
    () =>
      verifyFile(
        new File([bytes], "evidence.pdf", { type: "application/pdf" }),
        bytes,
      ),
    RequestSecurityError,
  );
});

test("macro-enabled and legacy Office formats are rejected", () => {
  const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer;
  assert.throws(() =>
    verifyFile(
      new File([bytes], "accounts.xlsm", {
        type: "application/vnd.ms-excel.sheet.macroEnabled.12",
      }),
      bytes,
    ),
  );
  assert.throws(() =>
    verifyFile(
      new File([bytes], "accounts.xls", { type: "application/vnd.ms-excel" }),
      bytes,
    ),
  );
});

test("CSV containing binary nulls is rejected", () => {
  const bytes = Uint8Array.from([65, 44, 66, 0, 67]).buffer;
  assert.throws(() =>
    verifyFile(new File([bytes], "tb.csv", { type: "text/csv" }), bytes),
  );
});

test("download names remove header and path control characters", () => {
  assert.equal(safeDownloadName('../bad\r\n"name.pdf'), ".._bad___name.pdf");
});

test("baseline browser security headers are present", () => {
  const headers = securityHeaders();
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);
});
