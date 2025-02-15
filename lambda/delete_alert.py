import json
import boto3
import os

def get_table():
  """Get DynamoDB table instance"""
  dynamodb = boto3.resource('dynamodb')
  return dynamodb.Table(os.getenv('SETTINGS_TABLE_NAME'))


def create_response(status_code, body, headers=None):
  """CORS対応のレスポンスを生成"""
  response = {
    'statusCode': status_code,
    'body': json.dumps(body, ensure_ascii=False)
  }
  if headers:
    response['headers'] = headers
  else:
    response['headers'] = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,DELETE'
    }
  return response

def get_all_settings():
    """DynamoDBからすべての設定を取得する"""
    print("Fetching all settings from DynamoDB")
    try:
        settings_table = get_table()
        response = settings_table.scan()
        items = response.get('Items', [])
        print(f"Fetched {len(items)} settings")
        return items
    except Exception as e:
        print(f"Error fetching settings from DynamoDB: {str(e)}")
        return []

def handler(event, context):
  """アラート設定を取得するLambda関数"""
  if event.get('httpMethod') == 'GET':
    # fcmまたはemailでフィルタリング
    query_params = event.get('queryStringParameters', {})
    userEmail = query_params.get('userEmail')
    userEmail = userEmail.replace('{', '').replace('}', '')

    if not userEmail:
      return create_response(404, {'message': '削除するアラートが見つかりませんでした'})

    settings = get_all_settings()

    for setting in settings:
      user_email = setting.get('userEmail')
      user_email = user_email.replace('{', '').replace('}', '')
      if user_email == userEmail:

        pkey = setting.get('gtfsRtEndpoint')
        skey = setting.get('userEmail')
        # 削除
        settings_table = get_table()
        settings_table.delete_item(Key={'gtfsRtEndpoint': pkey, 'userEmail': skey})
        return create_response(200, {'message': 'アラートを削除しました'})

    return create_response(404, {'settings': "アラートが見つかりませんでした"})
