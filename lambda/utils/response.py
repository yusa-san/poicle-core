import json
from decimal import Decimal

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return str(obj)
    raise TypeError

def create_response(status_code, body, headers=None):
    """CORS対応のレスポンスを生成"""
    response = {
        'statusCode': status_code,
        'body': json.dumps(body, default=decimal_default)
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
