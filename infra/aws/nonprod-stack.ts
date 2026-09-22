import { Stack, CfnOutput, CfnParameter, RemovalPolicy, aws_s3 as s3, aws_iam as iam, aws_budgets as budgets, aws_cloudwatch as cw, aws_sns as sns } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { validateConfig, type NonprodConfig, type IsolationPolicy } from "./config";
import privateBucket from "./s3-private-bucket.json";

export class NonprodStack extends Stack {
  constructor(scope: Construct, config: NonprodConfig, policy: IsolationPolicy) {
    const c = validateConfig(config, policy);
    super(scope, c.stackName, { env: { account: c.accountId, region: c.region }, analyticsReporting: false });
    const bucket = new s3.CfnBucket(this, "Recordings", {
      bucketName: c.bucketName,
      publicAccessBlockConfiguration: { blockPublicAcls: privateBucket.PublicAccessBlockConfiguration.BlockPublicAcls, ignorePublicAcls: true, blockPublicPolicy: true, restrictPublicBuckets: true },
      ownershipControls: { rules: [{ objectOwnership: "BucketOwnerEnforced" }] },
      bucketEncryption: { serverSideEncryptionConfiguration: [{ serverSideEncryptionByDefault: { sseAlgorithm: "AES256" } }] },
      corsConfiguration: { corsRules: [{ allowedOrigins: c.corsOrigins, allowedMethods: ["PUT", "GET", "HEAD"], allowedHeaders: ["content-type", "if-none-match", "x-amz-server-side-encryption"], exposedHeaders: ["ETag"], maxAge: 300 }] },
      lifecycleConfiguration: { rules: [{ id: "AbortIncompleteRecordingMultipartUploads", status: "Enabled", prefix: "organizations/", abortIncompleteMultipartUpload: { daysAfterInitiation: 1 } }] },
    });
    bucket.applyRemovalPolicy(RemovalPolicy.RETAIN);
    new s3.CfnBucketPolicy(this, "TlsOnly", { bucket: bucket.ref, policyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Deny", Principal: "*", Action: "s3:*", Resource: [bucket.attrArn, `${bucket.attrArn}/*`], Condition: { Bool: { "aws:SecureTransport": "false" } } }] } });
    const issuerHost = `oidc.vercel.com${c.vercel.issuerMode === "team" ? `/${c.vercel.team}` : ""}`;
    const audience = `https://vercel.com/${c.vercel.team}`;
    // L1 emits only CloudFormation; no thumbprint discovery/custom-resource/network lookup.
    const oidc = new iam.CfnOIDCProvider(this, "VercelOidc", { url: `https://${issuerHost}`, clientIdList: [audience] });
    oidc.applyRemovalPolicy(RemovalPolicy.RETAIN);
    const modelArn = `arn:aws:bedrock:${c.region}::foundation-model/${c.bedrockModelId}`;
    const role = new iam.CfnRole(this, "RuntimeRole", {
      maxSessionDuration: 3600,
      assumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Federated: oidc.attrArn }, Action: "sts:AssumeRoleWithWebIdentity", Condition: { StringEquals: { [`${issuerHost}:aud`]: audience, [`${issuerHost}:sub`]: `owner:${c.vercel.team}:project:${c.vercel.project}:environment:${c.vercel.environment}` } } }] },
      policies: [{ policyName: "RuntimeOnly", policyDocument: { Version: "2012-10-17", Statement: [
        { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource: `${bucket.attrArn}/organizations/*/projects/*/meetings/*/recordings/*` },
        { Effect: "Allow", Action: "s3:ListBucket", Resource: bucket.attrArn, Condition: { StringLike: { "s3:prefix": ["organizations/*/projects/*/meetings/*/recordings/*"] } } },
        { Effect: "Allow", Action: "bedrock:InvokeModel", Resource: modelArn, Condition: { StringEquals: { "aws:RequestedRegion": c.region } } },
      ] } }],
    });
    const email = new CfnParameter(this, "NotificationEmail", { type: "String", noEcho: true, allowedPattern: "[^\\s@]+@[^\\s@]+\\.[^\\s@]+", description: "Approved nonproduction notification recipient; subscription confirmation required" });
    const topic = new sns.CfnTopic(this, "Alerts", { subscription: [{ protocol: "email", endpoint: email.valueAsString }] });
    new sns.CfnTopicPolicy(this, "AlertPolicy", { topics: [topic.ref], policyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "cloudwatch.amazonaws.com" }, Action: "sns:Publish", Resource: topic.ref, Condition: { StringEquals: { "aws:SourceAccount": c.accountId }, ArnLike: { "aws:SourceArn": `arn:aws:cloudwatch:${c.region}:${c.accountId}:alarm:*` } } }] } });
    new budgets.CfnBudget(this, "MonthlyAwsBudget", { budget: { budgetName: `${c.stackName}-monthly`, budgetType: "COST", timeUnit: "MONTHLY", budgetLimit: { amount: c.awsBudgetUsd, unit: "USD" } }, notificationsWithSubscribers: [50, 80, 100].map(threshold => ({ notification: { comparisonOperator: "GREATER_THAN", notificationType: "ACTUAL", thresholdType: "PERCENTAGE", threshold }, subscribers: [{ subscriptionType: "EMAIL", address: email.valueAsString }] })) });
    new cw.CfnAlarm(this, "S3Capacity", { namespace: "AWS/S3", metricName: "BucketSizeBytes", dimensions: [{ name: "BucketName", value: bucket.ref }, { name: "StorageType", value: "StandardStorage" }], statistic: "Average", period: 86400, evaluationPeriods: 1, threshold: c.s3WarningBytes, comparisonOperator: "GreaterThanOrEqualToThreshold", treatMissingData: "missing", alarmActions: [topic.ref] });
    for (const metricName of ["InputTokenCount", "OutputTokenCount"]) new cw.CfnAlarm(this, metricName, { namespace: "AWS/Bedrock", metricName, dimensions: [{ name: "ModelId", value: c.bedrockModelId }], statistic: "Sum", period: 86400, evaluationPeriods: 1, threshold: c.bedrockDailyTokenWarning, comparisonOperator: "GreaterThanOrEqualToThreshold", treatMissingData: "missing", alarmActions: [topic.ref] });
    new CfnOutput(this, "RecordingBucketName", { value: bucket.ref });
    new CfnOutput(this, "RuntimeRoleArn", { value: role.attrArn });
    new CfnOutput(this, "OidcProviderArn", { value: oidc.attrArn });
    new CfnOutput(this, "AwsRegion", { value: c.region });
    new CfnOutput(this, "AlertTopicArn", { value: topic.ref });
  }
}
