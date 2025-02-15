# lambda/handler.py
import json
import os
import boto3
from decimal import Decimal
import uuid
from utils.response import create_response
from utils.db import get_table, get_all_settings

def validate_point(point):
    if point.get('type') != 'Point' or 'coordinates' not in point:
        return False
    properties = point.get('properties', {})
    if 'radius' not in properties:
        return False
    return True

def convert_floats_to_decimal(obj):
    if isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    else:
        return obj

def main(event, context):
    """API Gatewayからのリクエストを処理する関数"""
    if event.get('httpMethod') == 'OPTIONS':
        return create_response(204, {}, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,DELETE,PUT'
        })

    # 削除処理を追加
    if event.get('httpMethod') == 'DELETE':
        path_params = event.get('pathParameters', {})
        item_id = path_params.get('id')
        if not item_id:
            return create_response(400, {'message': 'id is required in path'})

        try:
            settings = get_all_settings()

            for setting in settings:
                if setting.get('id') == item_id:
                    settings_table = get_table()
                    settings_table.delete_item(Key={'gtfsRtEndpoint': setting['gtfsRtEndpoint'], 'userEmail': setting['userEmail']})

            return create_response(200, {'message': 'Item deleted successfully'})
        except Exception as e:
            print(f"Error deleting item: {str(e)}")
            return create_response(500, {'message': 'Error deleting item'})


    if event.get('httpMethod') == 'GET':
        # fcmまたはemailでフィルタリング
        query_params = event.get('queryStringParameters', {})
        email = query_params.get('email')
        email = email.replace('{', '').replace('}', '')

        if not email:
            return create_response(400, {'message': 'fcm or email query parameter is required'})

        settings = get_all_settings()
        filtered_settings = []

        for setting in settings:
            user_email = setting.get('userEmail')
            user_email = user_email.replace('{', '').replace('}', '')
            user_email = '@'.join(user_email.split('@')[:-1])
            print(f"Comparing {user_email} with {email}")
            if user_email == email:
                filtered_settings.append(setting)

        return create_response(200, {'settings': filtered_settings})

    if event.get('httpMethod') == 'PUT':
        # idをパスパラメータから取得
        path_params = event.get('pathParameters', {})
        item_id = path_params.get('id')
        if not item_id:
            return create_response(400, {'message': 'id is required in path'})

        try:
            data = json.loads(event['body'])
            gtfs_endpoint = data['gtfs_endpoint']
            user_email = data['user_email']
            gtfs_rt_endpoint = data['gtfs_rt_endpoint']
            webhook_url = data['webhook_url']
            filters = data.get('filters', {})
            filters = convert_floats_to_decimal(filters)
            details = data.get('details', {})

            if gtfs_rt_endpoint != 'odpt_jreast' and gtfs_rt_endpoint != 'data' and gtfs_rt_endpoint != 'yanbaru-expressbus':
                return create_response(400, {'message': 'Invalid gtfs_rt_endpoint'})

            # GeoJSON検証はPOST時と同様
            if 'target_area' in filters:
                target_area = filters['target_area']
                if isinstance(target_area, list):
                    if not all(validate_point(point) for point in target_area):
                        return create_response(400, {'message': 'Invalid GeoJSON Point format in target_area list'})
                elif isinstance(target_area, dict):
                    if not validate_point(target_area):
                        return create_response(400, {'message': 'Invalid GeoJSON Point format in target_area'})
                else:
                    return create_response(400, {'message': 'Invalid target_area format'})

            # GSIからidで該当アイテムを検索
            settings_table = get_table()
            result = settings_table.query(
                IndexName='IdIndex',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('id').eq(item_id)
            )
            items = result.get('Items', [])
            if not items:
                return create_response(404, {'message': 'Item not found by id'})

            # 見つかったアイテムがある場合は上書き
            # PK, SKは元のものを維持したい場合はitems[0]から取得
            original_item = items[0]
            original_gtfsRtEndpoint = original_item['gtfsRtEndpoint']
            original_userEmail = original_item['userEmail']

            # gtfsRtEndpoint, userEmailを変更可能にする場合はそのままdataの値を利用、
            # 不変とする場合はoriginalから使うなど自由に調整
            settings_table.put_item(Item={
                'gtfsRtEndpoint': gtfs_rt_endpoint if gtfs_rt_endpoint else original_gtfsRtEndpoint,
                'userEmail': user_email if user_email else original_userEmail,
                'id': item_id,
                'gtfsEndpoint': gtfs_endpoint,
                'webhook_url': webhook_url,
                'filters': filters,
                'details': details,
            })
            return create_response(200, {'message': 'Settings updated.', 'id': item_id})

        except (KeyError, json.JSONDecodeError) as e:
            print(f"Error parsing request: {str(e)}")
            return create_response(400, {'message': 'Invalid request format'})
        except Exception as e:
            print(f"Error updating settings: {str(e)}")
            return create_response(500, {'message': f'Error updating settings: {str(e)}'})

    # 以下はPOST時の処理
    try:
        data = json.loads(event['body'])
        print(f"Parsed data: {data}")

        gtfs_rt_endpoint = data['gtfs_rt_endpoint']
        user_email = data['user_email']
        gtfs_endpoint = data['gtfs_endpoint']
        webhook_url = data['webhook_url']
        filters = data.get('filters', {})
        filters = convert_floats_to_decimal(filters)

        if gtfs_rt_endpoint != 'odpt_jreast' and gtfs_rt_endpoint != 'data' and gtfs_rt_endpoint != 'yanbaru-expressbus':
            return create_response(400, {'message': 'Invalid gtfs_rt_endpoint'})

        # GeoJSONの検証（必要に応じて）
        if 'target_area' in filters:
            target_area = filters['target_area']
            # Update validation to handle list of points

            if isinstance(target_area, list):
                if not all(validate_point(point) for point in target_area):
                    return create_response(400, {'message': 'Invalid GeoJSON Point format in target_area list'})
            elif isinstance(target_area, dict):
                if not validate_point(target_area):
                    return create_response(400, {'message': 'Invalid GeoJSON Point format in target_area'})
            else:
                return create_response(400, {'message': 'Invalid target_area format'})

    except (KeyError, json.JSONDecodeError) as e:
        print(f"Error parsing request: {str(e)}")
        return create_response(400, {'message': 'Invalid request format'})

    print(f"Saving settings for {user_email} with GTFS-RT URL: {gtfs_endpoint}")

    try:
        # detailsが存在すればそのまま、なければ空dictを使用
        details = data.get('details', {})

        settings_table = get_table()

        # 新規作成時にidを自動生成する処理を追加
        id_str = str(uuid.uuid4())

        settings_table.put_item(Item={
            'gtfsRtEndpoint': gtfs_rt_endpoint,
            'gtfsEndpoint': gtfs_endpoint,
            'userEmail': user_email,
            'id': id_str,  # 新規追加：IDを保存
            'webhook_url': webhook_url,
            'filters': filters,
            'details': details,
        })
        print("Settings saved successfully.")

        dynamodb = boto3.resource('dynamodb')
        settings_table_for_trace = dynamodb.Table(os.getenv('SETTINGS_TABLE_NAME_FOR_TRACE'))
        settings_table_for_trace.put_item(Item={
            'gtfsRtEndpoint': gtfs_rt_endpoint,
            'userEmail': user_email,
            'id': id_str,
            'gtfsEndpoint': gtfs_endpoint,
            'webhook_url': webhook_url,
            'filters': filters,
            'details': details,
        })
    except Exception as e:
        print(f"Error saving settings to DynamoDB: {str(e)}")
        return create_response(500, {'message': 'Error saving settings'})

    return create_response(200, {'message': 'Settings saved.', 'id': id_str})
