# GTFS-RT Trigger

このプロジェクトは、AWS上でGTFS-RTフィードを監視し、特定の条件に一致する車両情報が検出された際にWebhookをトリガーするシステムを構築します。AWS CDK (Cloud Development Kit) を使用して、必要なインフラストラクチャ（DynamoDB、Lambda、API Gateway、EventBridge）をデプロイします。React製のシンプルなWebコンソールで設定を管理できます。

## 特徴

- GTFS-RTフィードのリアルタイム監視
- 柔軟なフィルター条件設定（trip_id, stop_id, date, time, weekday, target area（GeoJSON Polygon））
- Webhookトリガーによる外部システム連携
- 設定管理用Webコンソール
- AWS CDKによるインフラストラクチャ管理
- Mattermostへの通知機能（デバッグ用）

### 主要ファイル解説

- `bin/gtfs-rt-trigger.ts`: CDKアプリのエントリポイント。
- `cdk.json`: CDKの設定ファイル。
- `client`: React製のWebコンソール。
- `lambda`: Lambda関数のソースコード。
- `lib`: CDKスタックの定義。
- `test`: テストコード。

## インストール

1. AWS CLIとCDK Toolkitがインストールされていることを確認します。
2. プロジェクトをクローンします。
3. 依存関係をインストールします: `npm install`
4. clientディレクトリに移動し、Reactアプリの依存関係をインストールします: `cd client && npm install`

## 環境設定ファイルの作成

次のようにメール送信に必要な情報を記載した環境変数の設定ファイルを`.env`として配置します。

```
MATTERMOST_WEBHOOK_URL=https://mattermost.example.com/hooks/xxxxxx
SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=AKIAxxx
SMTP_PASSWORD=yyyyyyyyyyyyyyyy
SENDER_EMAIL=poicle@example.com
```

## デプロイ

1. AWSアカウントとリージョンを設定します。
2. CDKスタックをデプロイします: `npm run cdk deploy`
3. デプロイ後、CloudFrontURLが出力されます。

## 使い方

1. デプロイ後、出力されたCloudFrontURLにアクセスし、Webコンソールを開きます。
2. Webコンソールで以下の設定を入力し、"設定を保存"ボタンをクリックします。

### DynamoDBに保存される設定の形式

以下は、DynamoDBに保存される設定情報の例です。この設定はWebコンソールから入力された情報に基づき、Lambda関数で処理されてDynamoDBに保存されます。

```json
{
  "gtfsEndpoint": "https://example.com/gtfs-rt",
  "userEmail": "user@example.com",
  "gtfsRtEndpoint": "https://example.com/gtfs-rt-endpoint",
  "webhook_url": "https://example.com/webhook",
  "filters": {
    "trip_id": "trip123",
    "stop_id": "stop456",
    "date": "2023-10-01",
    "start_time": "2023-10-01T08:00:00Z",
    "end_time": "2023-10-01T20:00:00Z",
    "weekday": ["Monday", "Wednesday", "Friday"],
    "target_area": {
      "type": "Polygon",
      "coordinates": [
        [
          [139.0, 35.0],
          [139.5, 35.0],
          [139.5, 35.5],
          [139.0, 35.5],
          [139.0, 35.0]
        ]
      ]
    }
  }
}
```

### 各フィールドの詳細

- `gtfsEndpoint`: GTFS-RTフィードのエンドポイントURL。
- `userEmail`: 設定を識別するためのユーザーメールアドレス。
- `gtfsRtEndpoint`: GTFS-RTフィードのエンドポイントURL。
- `webhook_url`: 条件が一致した場合に呼び出されるWebhookのURL。
- `filters`: データをフィルタリングするための条件設定。
  - `trip_id`: 特定のtrip_idに一致する車両のみを対象とする。
  - `stop_id`: 特定のstop_idに一致する車両のみを対象とする。
  - `date`: 特定の日付に一致する車両のみを対象とする（YYYY-MM-DD 形式）。
  - `start_time`: 特定の開始時刻以降の車両のみを対象とする（YYYY-MM-DDTHH:mm:ssZ 形式）。
  - `end_time`: 特定の終了時刻以前の車両のみを対象とする（YYYY-MM-DDTHH:mm:ssZ 形式）。
  - `weekday`: 特定の曜日に一致する車両のみを対象とする（["Monday", "Tuesday", ...] 形式）。
  - `target_area`: GeoJSON Polygon形式で指定したエリア内にいる車両のみを対象とする。

## 環境変数

- `MATTERMOST_WEBHOOK_URL`: Mattermost Incoming WebhookのURL。デバッグ通知に使用します。`cdk.json`ファイル内で定義するか、デプロイ時に指定します。
- `SETTINGS_TABLE_NAME`: DynamoDBテーブル名。CDKスタックによって自動的に設定されます。

## システムの動作概要

1. Webコンソールで設定を保存すると、データがDynamoDBに保存されます。
2. Lambda関数が定期的にGTFS-RTフィードを監視し、設定したフィルター条件と一致する車両が検出されると、指定されたWebhook URLにPOSTリクエストが送信されます。
3. POSTリクエストには、車両ID、位置情報、タイムスタンプなどが含まれ、必要に応じてMattermostにも通知が送信されます。
