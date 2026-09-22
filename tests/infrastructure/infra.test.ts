import { describe, expect, it } from "vitest";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { NonprodStack } from "../../infra/aws/nonprod-stack";
import { validateConfig, policySchema, assertDatabaseTarget, assertCloudApply, configurationDigest } from "../../infra/aws/config";
import fixture from "./fixture.json";
const policy = policySchema.parse(fixture.policy);
const config = validateConfig(fixture.config, policy);
function template() { return Template.fromStack(new NonprodStack(new App(), config, policy)); }
describe("offline CDK assertions", () => {
  it("private encrypted retained bucket, exact CORS and TLS-only policy", () => {
    const t = template();
    t.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain", Properties: Match.objectLike({ PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true }, BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] }, CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedOrigins: config.corsOrigins })] } }) });
    t.hasResourceProperties("AWS::S3::BucketPolicy", { PolicyDocument: { Version: "2012-10-17", Statement: [Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } })] } });
  });
  it("trust only exact team/project/preview; never GitHub or production", () => {
    const t = template();
    t.hasResourceProperties("AWS::IAM::OIDCProvider", { Url: "https://oidc.vercel.com/fixture-team", ClientIdList: ["https://vercel.com/fixture-team"] });
    t.hasResourceProperties("AWS::IAM::Role", { AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [Match.objectLike({ Action: "sts:AssumeRoleWithWebIdentity", Condition: { StringEquals: { "oidc.vercel.com/fixture-team:aud": "https://vercel.com/fixture-team", "oidc.vercel.com/fixture-team:sub": "owner:fixture-team:project:fixture-app:environment:preview" } } })] } });
    const body = JSON.stringify(t.toJSON()); expect(body).not.toContain("environment:production"); expect(body).not.toContain("token.actions.githubusercontent.com");
  });
  it("runtime grants only scoped recording operations and one model", () => {
    const t = template();
    t.hasResourceProperties("AWS::IAM::Role", { Policies: [{ PolicyName: "RuntimeOnly", PolicyDocument: { Version: "2012-10-17", Statement: [
      Match.objectLike({ Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource: Match.anyValue() }),
      Match.objectLike({ Action: "s3:ListBucket", Condition: { StringLike: { "s3:prefix": ["organizations/*/projects/*/meetings/*/recordings/*"] } } }),
      { Effect: "Allow", Action: "bedrock:InvokeModel", Resource: "arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0", Condition: { StringEquals: { "aws:RequestedRegion": "ap-northeast-1" } } },
    ] } }] });
    const body = JSON.stringify(t.findResources("AWS::IAM::Role"));
    expect(body).not.toContain('"Resource":"*"'); expect(body).not.toContain('"Action":"*"'); expect(body).not.toContain("iam:PassRole");
  });
  it("budget thresholds, missing-data alarms and no network custom resources", () => {
    const t = template();
    t.hasResourceProperties("AWS::Budgets::Budget", { Budget: Match.objectLike({ BudgetLimit: { Amount: 5, Unit: "USD" }, TimeUnit: "MONTHLY" }), NotificationsWithSubscribers: [50,80,100].map(Threshold => Match.objectLike({ Notification: Match.objectLike({ Threshold }) })) });
    t.resourceCountIs("AWS::CloudWatch::Alarm", 3);
    t.hasResourceProperties("AWS::CloudWatch::Alarm", { MetricName: "InputTokenCount", TreatMissingData: "missing" });
    t.hasResourceProperties("AWS::CloudWatch::Alarm", { MetricName: "BucketSizeBytes", Period: 86400 });
    expect(JSON.stringify(t.toJSON())).not.toContain("Custom::");
    expect(JSON.stringify(t.toJSON())).not.toContain("AWS_ACCESS_KEY_ID");
    expect(t.toJSON().Parameters.NotificationEmail.NoEcho).toBe(true);
  });
  it("global issuer supported without broadening subject", () => {
    const c = validateConfig({ ...fixture.config, vercel: { ...fixture.config.vercel, issuerMode: "global" } }, policy);
    Template.fromStack(new NonprodStack(new App(), c, policy)).hasResourceProperties("AWS::IAM::OIDCProvider", { Url: "https://oidc.vercel.com" });
  });
});
describe("environment and approval denial", () => {
  it.each([
    { environment: "production" }, { accountId: "999999999999" }, { accountId: "222222222222" },
    { region: "" }, { region: "us-east-1" }, { stackName: "kirokuru-dev-unapproved" },
    { vercel: { ...fixture.config.vercel, environment: "production" } },
    { vercel: { ...fixture.config.vercel, project: "*" } },
    { database: { ...fixture.config.database, host: "ep-production.example.invalid" } },
    { database: { ...fixture.config.database, host: "ep-production-pooler.example.invalid" } },
    { corsOrigins: ["https://*.example.invalid"] }, { bedrockModelId: "*" },
  ])("rejects forbidden configuration %j", changes => { expect(() => validateConfig({ ...fixture.config, ...changes }, policy)).toThrow(); });
  it("rejects allowlist/production overlap even with nonprod resource names", () => { expect(() => validateConfig(fixture.config, { ...policy, productionAccountIds: [config.accountId] })).toThrow(); });
  it.each([
    "postgresql://fixture_runtime@ep-production.example.invalid/fixture?sslmode=verify-full",
    "postgresql://fixture_runtime@ep-fixture.example.invalid/fixture?sslmode=require",
    "postgresql://fixture_runtime@ep-fixture.example.invalid/fixture?sslmode=verify-full&hostaddr=192.0.2.1",
    "postgresql://admin@ep-fixture.example.invalid/fixture?sslmode=verify-full",
  ])("rejects unsafe DB target without logging URL", url => { expect(() => assertDatabaseTarget(config, policy, url)).toThrow("Database target denied"); });
  it("accepts only pinned TLS target", () => { expect(() => assertDatabaseTarget(config, policy, "postgresql://fixture_runtime@ep-fixture.example.invalid/fixture?sslmode=verify-full")).not.toThrow(); });
  it("requires explicit digest-bound approval and never permits fixture apply", () => {
    const c = { ...config, synthetic: false };
    const now = new Date("2026-09-22T00:00:00Z");
    const a = { allowed: true, digest: configurationDigest(c, policy), accountId: c.accountId, stackName: c.stackName, expiresAt: "2026-09-22T01:00:00Z", reference: "fixture-approval", fixture: false };
    expect(() => assertCloudApply(c, policy, undefined, now)).toThrow();
    expect(() => assertCloudApply(c, policy, a, now)).not.toThrow();
    expect(() => assertCloudApply(config, policy, a, now)).toThrow();
    expect(() => assertCloudApply(c, policy, { ...a, allowed: false }, now)).toThrow();
    expect(() => assertCloudApply(c, policy, { ...a, expiresAt: "2026-09-21T00:00:00Z" }, now)).toThrow();
    expect(() => assertCloudApply({ ...c, awsBudgetUsd: 6 }, policy, a, now)).toThrow();
  });
});
