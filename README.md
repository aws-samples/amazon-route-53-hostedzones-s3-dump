# Amazon Route 53 HostedZones S3 Dump

This AWS CDK app deploys infrastructure to periodically dump Amazon Route 53 hosted zones and resource record set information to an Amazon S3 bucket.

## Architecture
The key components are:

- An Amazon S3 bucket to store the output JSON files
- IAM roles and policies allowing the Lambda access to Route 53 and S3
- A Python Lambda function that calls the Route 53 APIs and dumps the data to S3
- Amazon EventBridge rules to trigger the Lambda on a schedule and when Route 53 changes occur

## Usage
To deploy, clone repo,  [install the CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/cli.html), run:
```
npm install
```
to install dependencies and than:

```
cdk deploy
```

This will provision the necessary AWS resources in `us-east-1` region.

The Lambda function will run every Sunday at 1 AM to dump all hosted zones and record sets. It will also trigger whenever Route 53 record set changes are detected.

The output will be stored in the S3 bucket with filenames based on the hosted zone name for easy reference later.

## Requirements
- AWS CDK v2.0.0+
- Node.js v16.x
- Python 3.7+
- Boto3
- AWS account credentials configured with CDK deploy permissions

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
