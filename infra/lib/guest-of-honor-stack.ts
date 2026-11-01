import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

/**
 * Guest of Honor.
 *
 *   CloudFront ──> site bucket (the React app from dist/, plus config.json)
 *   Phones and TV ──wss──> WebSocket API ──> rooms Lambda ──> DynamoDB
 *
 * shampoe.com serves this distribution at /guest-of-honor/app/. Phones connect to the
 * WebSocket API directly, using the URL in config.json.
 */
export class GuestOfHonorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // saved games will live here too
    });

    const repo = path.join(__dirname, '../..');
    const rooms = new nodejs.NodejsFunction(this, 'Rooms', {
      entry: path.join(__dirname, '../lambda/rooms.ts'), // imports the shared engine from src/engine
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE: table.tableName },
      logGroup: new logs.LogGroup(this, 'RoomsLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    table.grantReadWriteData(rooms);

    // Not "Default": CDK leaves construct ids named Default out of resource names, which collides with the route.
    const integration = (name: string) => new WebSocketLambdaIntegration(`${name}Integration`, rooms);
    const api = new apigw.WebSocketApi(this, 'RoomsApi', {
      connectRouteOptions: { integration: integration('Connect') },
      disconnectRouteOptions: { integration: integration('Disconnect') },
      defaultRouteOptions: { integration: integration('Message') },
    });
    const stage = new apigw.WebSocketStage(this, 'Prod', {
      webSocketApi: api,
      stageName: 'prod',
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 }, // a party is a few messages a second
    });
    api.grantManageConnections(rooms); // post views back to phones, this API only

    const site = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // public access goes through CloudFront only
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // everything here is rebuilt from dist/
    });

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'Guest of Honor',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // North America + Europe edges: cheapest tier
    });

    new s3deploy.BucketDeployment(this, 'Deploy', {
      sources: [
        s3deploy.Source.asset(path.join(repo, 'dist')),
        // The WebSocket URL only exists after deploy, so the app reads it at startup instead of build time.
        s3deploy.Source.jsonData('config.json', { roomUrl: stage.url }),
      ],
      destinationBucket: site,
      // shampoe.com's proxy behavior doesn't cache files without Cache-Control, so set it here.
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=300')],
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'RoomUrl', { value: stage.url });
  }
}
