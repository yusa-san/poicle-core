import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class GtfsRtWebhookStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const SUFFIX = '-common';

    // DynamoDBテーブル作成
    const settingsTable = new dynamodb.Table(this, `SettingsTable${SUFFIX}`, {
      partitionKey: { name: 'gtfsRtEndpoint', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userEmail', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // これまでに作成されたアラート一覧
    const settingsTableForTrace = new dynamodb.Table(this, `SettingsTableForTrace${SUFFIX}`, {
      partitionKey: { name: 'gtfsRtEndpoint', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userEmail', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Lambda関数作成（設定保存用）
    const saveSettingsLambda = new lambda.Function(this, `SaveSettingsLambda${SUFFIX}`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.main',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SETTINGS_TABLE_NAME: settingsTable.tableName,
        SETTINGS_TABLE_NAME_FOR_TRACE: settingsTableForTrace.tableName,
        API_BASE_URL: process.env.API_BASE_URL ?? '',
      },
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
    });

    // LambdaにDynamoDBのアクセス権限を付与
    settingsTable.grantFullAccess(saveSettingsLambda);
    settingsTableForTrace.grantFullAccess(saveSettingsLambda);

    // API Gatewayで設定管理用エンドポイントを作成
    const api = new apigateway.RestApi(this, `GtfsSettingsApi${SUFFIX}`, {
      restApiName: 'GTFS Settings API',
      description: 'API to manage GTFS-RT webhook and trigger settings',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // /settingsリソースの作成
    const settings = api.root.addResource(`settings`);

    // Lambda統合の作成（設定保存用）
    const getIntegration = new apigateway.LambdaIntegration(saveSettingsLambda, {
      proxy: true,
    });
    const postIntegration = new apigateway.LambdaIntegration(saveSettingsLambda, {
      proxy: true,
    });

    // GET /settings
    settings.addMethod('GET', getIntegration);

    // POST /settings
    settings.addMethod('POST', postIntegration);

    // PUT /settings/{id}
    const singleSetting = settings.addResource('{id}');
    singleSetting.addMethod('PUT', new apigateway.LambdaIntegration(saveSettingsLambda, {
      proxy: true,
    }));

    // DELETE /settings/{id}
    singleSetting.addMethod('DELETE', new apigateway.LambdaIntegration(saveSettingsLambda, {
      proxy: true,
    }));

    const lambdaLayers = [lambda.LayerVersion.fromLayerVersionArn(this, `lambdaLayer${SUFFIX}`, 'arn:aws:lambda:ap-northeast-1:211125380625:layer:gtfs-rt-trigger:2')]

    // スケジュール実行するLambda関数の作成
    const scheduledLambda = new lambda.Function(this, `ScheduledGtfsLambda${SUFFIX}`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'scheduled_task.scheduled_task',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SETTINGS_TABLE_NAME: settingsTable.tableName,
        API_BASE_URL: process.env.API_BASE_URL ?? '',
      },
      timeout: cdk.Duration.seconds(300), // 必要に応じて調整
      layers: lambdaLayers,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 2048,
    });

    // LambdaにDynamoDBの読み取り権限を付与
    settingsTable.grantFullAccess(scheduledLambda);

    // Lambdaに外部へのアクセス許可を付与（GTFS-RTデータ取得とWebHook呼び出しのため）
    scheduledLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }));

    // EventBridgeルールの作成（1分ごとにLambdaをトリガー）
    new events.Rule(this, `ScheduleRule${SUFFIX}`, {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(scheduledLambda)],
    });

    // MatterMost通知用のデバッグLambda関数作成
    const mattermostLambda = new lambda.Function(this, `MattermostLambdaFunction${SUFFIX}`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'mattermost_handler.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        MATTERMOST_WEBHOOK_URL: process.env.MATTERMOST_WEBHOOK_URL ?? '',
        SMTP_HOST: process.env.SMTP_HOST ?? '',
        SMTP_PORT: process.env.SMTP_PORT ?? '',
        SMTP_USER: process.env.SMTP_USER ?? '',
        SMTP_PASSWORD: process.env.SMTP_PASSWORD ?? '',
        SENDER_EMAIL: process.env.SENDER_EMAIL ?? '',
        API_BASE_URL: process.env.API_BASE_URL ?? '',
      },
      layers: lambdaLayers,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
    });

    // /notifyリソースの作成
    const notify = api.root.addResource(`notify`);

    // MatterMost通知LambdaのAPI Gateway統合
    const notifyIntegration = new apigateway.LambdaIntegration(mattermostLambda, {
      proxy: true,
    });

    notify.addMethod('POST', notifyIntegration);

    // アラーム削除のLambda
    const deleteAlarmLambda = new lambda.Function(this, 'DeleteAlarmLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'delete_alert.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        SETTINGS_TABLE_NAME: settingsTable.tableName,
      },
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(900),
    });
    settingsTable.grantReadWriteData(deleteAlarmLambda);

    const deleteAlarm = api.root.addResource('delete-alarm');
    const deleteAlarmIntegration = new apigateway.LambdaIntegration(deleteAlarmLambda, {
      proxy: true,
    });
    deleteAlarm.addMethod('GET', deleteAlarmIntegration);

    // S3バケット作成 (Webコンソールのホスティング)
    const webBucket = new s3.Bucket(this, `GtfsWebAppBucket${SUFFIX}`, {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFrontディストリビューション作成 (S3バケットを配信)
    const distribution = new cloudfront.Distribution(this, `GtfsWebAppDistribution${SUFFIX}`, {
      defaultBehavior: {
        origin: new origins.S3Origin(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    });

    // S3にWebアプリ（HTMLファイルなど）をデプロイ
    new s3deploy.BucketDeployment(this, `DeployWebApp${SUFFIX}`, {
      sources: [s3deploy.Source.asset('./client/dist')],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // 出力 - WebアプリのCloudFront URL
    new cdk.CfnOutput(this, `CloudFrontURL${SUFFIX}`, {
      value: distribution.distributionDomainName,
      description: 'The CloudFront URL to access the web application',
    });
  }
}
