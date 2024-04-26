import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cwlogs from 'aws-cdk-lib/aws-logs';
import { Construct } from "constructs";
import { NagSuppressions } from 'cdk-nag';

export class R53DumpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const r53DumpBucket = new s3.Bucket(this, "R53DumpBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(356),

        },
      ],
    });

    NagSuppressions.addResourceSuppressions(r53DumpBucket, [
      { id: 'AwsSolutions-S1', reason: 'technical bucket without general access' },
    ]);

    const managedPolicy3R53 = new iam.ManagedPolicy(
      this,
      "ManagedPolicy3-r53",
      {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "route53:ListHostedZones",
            ],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            actions: [
              "route53:ListResourceRecordSets",
            ],
            resources: ["arn:aws:route53:::hostedzone/*"],
          }),
          new iam.PolicyStatement({
            actions: ["s3:PutObject"],
            resources: [r53DumpBucket.arnForObjects("route53/*")],
          }),
        ],
      }
    );
    
    NagSuppressions.addResourceSuppressions(managedPolicy3R53, [
      { 
        id: 'AwsSolutions-IAM5', 
        reason: 'lambda needs read only access to all hosted zones to be able to perform dump', 
        appliesTo: ["Resource::arn:aws:route53:::hostedzone/*"] 
      },     
      { 
        id: 'AwsSolutions-IAM5', 
        reason: 'lambda needs read only access to all hosted zones to be able to perform dump', 
        appliesTo: ["Resource::*"] 
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'lambda needs write access to the dump bucket',
      }
    ]);

    const lambdaExecRole = new iam.Role(this, "LambdaExecRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [managedPolicy3R53],
    });

    const r53dumpLambdaLogs = new cwlogs.LogGroup(this, 
      "r53dumpLambdaLogs", 
      { retention: cwlogs.RetentionDays.FIVE_MONTHS, 
        logGroupName: '/r53dumpLambda', 
        removalPolicy: cdk.RemovalPolicy.DESTROY 
      });

    const r53dump = new lambda.Function(this, "R53dump", {
      code: new lambda.AssetCode("src/lambda"),
      environment: { BUCKET: r53DumpBucket.bucketName },
      handler: "lambda_function.lambda_handler",
      role: lambdaExecRole,
      runtime: lambda.Runtime.PYTHON_3_12,
      logGroup: r53dumpLambdaLogs,
    });

    r53dumpLambdaLogs.grantWrite(r53dump)

    r53dump.addLayers(lambda.LayerVersion.fromLayerVersionArn(this, 
      "r53dump-powertools-layer", 
      "arn:aws:lambda:us-east-1:017000801446:layer:AWSLambdaPowertoolsPythonV2:68"
    ))

    new events.Rule(this, "Scheduled_r53dump", {
      eventPattern: {},
      schedule: events.Schedule.cron({
        hour: "1",
        minute: "1",
        month: "*",
        year: "*",
        weekDay: "SUN",
      }),
      targets: [new eventsTargets.LambdaFunction(r53dump)],
    });

    new events.Rule(this, "Event_r53dump", {
      eventPattern: {
        detail: {
          eventName: ["ChangeResourceRecordSets"],
          eventSource: ["route53.amazonaws.com"],
        },
        detailType: ["AWS API Call via CloudTrail"],
        source: ["aws.route53"],
      },
      targets: [new eventsTargets.LambdaFunction(r53dump)],
    });

  }
}