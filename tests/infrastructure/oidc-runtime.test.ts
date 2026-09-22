import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ provider: vi.fn(() => async () => ({ accessKeyId: "synthetic", secretAccessKey: "synthetic" })) }));
vi.mock("@vercel/oidc-aws-credentials-provider", () => ({ awsCredentialsProvider: mock.provider }));
import { nonprodAwsCredentials } from "../../lib/aws/credentials";
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL: "1", VERCEL_ENV: "preview", AWS_NONPROD_ACCOUNT_ID: "111111111111", AWS_ROLE_ARN: "arn:aws:iam::111111111111:role/fixture", AWS_REGION: "ap-northeast-1" };
it("local existing credential chain remains unchanged", () => { expect(nonprodAwsCredentials({NODE_ENV:"test"})).toBeUndefined();expect(mock.provider).not.toHaveBeenCalled(); });
it("passes lazy short-lived official provider to SDK, not static keys", () => {expect(typeof nonprodAwsCredentials(env)).toBe("function");expect(mock.provider).toHaveBeenCalledWith({roleArn:env.AWS_ROLE_ARN});});
it.each([{VERCEL_ENV:"production"},{VERCEL_ENV:undefined},{AWS_ROLE_ARN:undefined},{AWS_REGION:undefined},{AWS_NONPROD_ACCOUNT_ID:"222222222222"},{AWS_ACCESS_KEY_ID:"synthetic"},{AWS_SECRET_ACCESS_KEY:"synthetic"},{AWS_SESSION_TOKEN:"synthetic"}])("rejects unsafe runtime %j", changes=>{expect(()=>nonprodAwsCredentials({...env,...changes})).toThrow("configuration rejected");expect(mock.provider).not.toHaveBeenCalled();});
