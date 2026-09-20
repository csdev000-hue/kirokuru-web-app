/** Pure checks shared by CI scripts and tests. Never return matching secret values. */
export function forbiddenPublicKeys(source: Record<string, string | undefined>) {
  return Object.keys(source).filter((key) => key.startsWith("NEXT_PUBLIC_") && /SECRET|TOKEN|PASSWORD|DATABASE|API_KEY|ACCESS_KEY|CREDENTIAL/i.test(key));
}
export function secretPatterns(text: string): string[] {
  const rules = [
    ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
    ["public-secret", /(?:process\.env\.|^\s*)NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|DATABASE|API_KEY|ACCESS_KEY)[A-Z0-9_]*(?:\s*=|\b)/m],
  ] as const;
  return rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
