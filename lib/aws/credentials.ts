import "server-only";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/** Nonproduction Vercel opt-in. Local SDK chains/Mock clients remain unchanged. */
export function nonprodAwsCredentials(env: NodeJS.ProcessEnv = process.env) {
  if (!env.AWS_ROLE_ARN && env.VERCEL !== "1") return undefined;
  const account = env.AWS_NONPROD_ACCOUNT_ID;
  const role = env.AWS_ROLE_ARN;
  if (!account || !/^\d{12}$/.test(account) || !role || !new RegExp(`^arn:aws:iam::${account}:role/[a-zA-Z0-9_+=,.@/-]+$`).test(role) ||
      !["development", "preview"].includes(env.VERCEL_ENV ?? "") || !env.AWS_REGION ||
      env.AWS_ACCESS_KEY_ID || env.AWS_SECRET_ACCESS_KEY || env.AWS_SESSION_TOKEN) {
    throw new Error("Nonproduction AWS OIDC configuration rejected");
  }
  return awsCredentialsProvider({ roleArn: role });
}
