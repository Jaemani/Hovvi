export function describeSimctlResult(result) {
  const text = result?.text || result?.stderr || result?.stdout || "";
  if (text) return text;
  if (result?.error?.code === "ETIMEDOUT") {
    return `simctl command timed out after ${result.error.timeout ?? "configured"}ms`;
  }
  if (result?.error?.message) return result.error.message;
  return "";
}
