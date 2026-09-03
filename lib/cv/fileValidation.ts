export function validateCvBytes(buf: Buffer, mime: string): boolean {
  if (mime === "application/pdf") return buf.subarray(0, 5).toString() === "%PDF-";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4;
  if (mime === "text/plain") return !buf.includes(0) && !buf.subarray(0, 100).toString().match(/^\s*<(?:!doctype html|html|script)/i);
  return false;
}
