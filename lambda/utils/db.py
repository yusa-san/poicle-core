import os
import boto3

def get_table():
    """Get DynamoDB table instance"""
    dynamodb = boto3.resource('dynamodb')
    return dynamodb.Table(os.getenv('SETTINGS_TABLE_NAME'))

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
