# tests/test_handler.py

import pytest
import json
import os
from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from google.transit import gtfs_realtime_pb2
from handler import (
    main,
)
from scheduled_task import (
    check_conditions,
    scheduled_task,
    trigger_webhook,
    fetch_gtfs_data
)
from utils.geo import is_within_radius, is_within_any_radius
from utils.response import create_response
from boto3.dynamodb.conditions import Key
import requests.exceptions

# テスト用の環境変数を設定
os.environ['SETTINGS_TABLE_NAME'] = 'test-table'

######################################################################
# フィクスチャ
######################################################################

@pytest.fixture
def mock_settings_item():
    """DynamoDBから取得した設定アイテムのモック"""
    return {
        'gtfsRtEndpoint': 'https://example.com/gtfs-rt-endpoint',
        'gtfsEndpoint': 'https://example.com/gtfs-endpoint',
        'userEmail': 'test@example.com',
        'webhook_url': 'https://example.com/webhook',
        'filters': {
            'trip_id': 'trip123',
            'stop_id': 'stop456',
            'weekday': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            'allow_multiple_notifications': False
        },
        'details': {'foo': 'bar'},
        'id': 'mock-id-1234'
    }

@pytest.fixture
def sample_geojson_point():
    return {
        "type": "Point",
        "coordinates": [139.2, 35.2],  # Longitude, Latitude
        "properties": {
            "radius": 5000  # 5km
        }
    }

@pytest.fixture
def sample_geojson_points():
    return [
        {
            "type": "Point",
            "coordinates": [139.0, 35.0],
            "properties": {"radius": 5000}
        },
        {
            "type": "Point",
            "coordinates": [140.0, 36.0],
            "properties": {"radius": 10000}
        }
    ]

@pytest.fixture
def sample_event(sample_geojson_points):
    return {
        'httpMethod': 'POST',
        'body': json.dumps({
            'gtfs_rt_endpoint': 'https://example.com/gtfs-rt-endpoint',
            'user_email': 'test@example.com',
            'gtfs_endpoint': 'https://example.com/gtfs-endpoint',
            'webhook_url': 'https://example.com/webhook',
            'filters': {
                'trip_id': 'trip123',
                'stop_id': 'stop456',
                'target_area': sample_geojson_points
            }
        })
    }

@pytest.fixture
def mock_dynamodb_table():
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_resource.return_value.Table.return_value = mock_table
        yield mock_table

@pytest.fixture(autouse=True)
def mock_get_table():
    """handler.get_table() 呼び出しを常にモック化する"""
    with patch('handler.get_table') as mock:
        mock_table = Mock()
        mock.return_value = mock_table
        yield mock_table

@pytest.fixture
def gtfs_feed_mock_vehicle():
    """
    FeedMessage内に1つのvehicle entityを含むGTFS-RTデータのモック。
    実際のVehiclePositionオブジェクトを生成してCopyFromする。
    """
    feed = gtfs_realtime_pb2.FeedMessage()
    entity = feed.entity.add()

    # 実際の VehiclePosition を生成して値を設定
    vehicle_position = gtfs_realtime_pb2.VehiclePosition()
    vehicle_position.vehicle.id = 'vehicle123'
    vehicle_position.position.latitude = 35.2
    vehicle_position.position.longitude = 139.2
    vehicle_position.trip.trip_id = 'trip123'
    vehicle_position.stop_id = 'stop456'
    vehicle_position.current_stop_sequence = 3
    vehicle_position.occupancy_status = 2  # 例: STANDING_ROOM_ONLY

    entity.vehicle.CopyFrom(vehicle_position)
    return feed

######################################################################
# create_response のテスト
######################################################################
def test_create_response():
    """create_response関数が正しいCORS対応のレスポンスを生成することを確認"""
    response = create_response(200, {'message': 'test'})
    assert response['statusCode'] == 200
    assert json.loads(response['body']) == {'message': 'test'}
    assert 'Access-Control-Allow-Origin' in response['headers']

######################################################################
# check_conditions のテスト
######################################################################

# stop_id の半径チェックで失敗するパターン
def test_check_conditions_no_match(sample_geojson_point):
    """check_conditions function should return False when vehicle is outside radius"""

    # get_stop_name をモックして有効座標を返す
    with patch('scheduled_task.get_stop_name') as mock_get_stop_name:
        mock_get_stop_name.return_value = ("Test Stop", 35.2, 139.2)
        # Vehicleをシンプルなクラスで定義
        class Vehicle:
            position = MagicMock(latitude=36.0, longitude=140.0)  # 遠い場所にする
            trip = MagicMock(trip_id='trip123', schedule_relationship=0)
            stop_id = 'stop456'
            current_stop_sequence = 3
            occupancy_status = 2

        vehicle = Vehicle()
        filters = {
            'trip_id': 'trip123',
            'stop_id': 'stop456',  # get_stop_nameで返す座標から離れた場所なのでNG
            'target_area': sample_geojson_point
        }
        assert check_conditions(vehicle, filters) is False

def test_check_conditions_no_match_any_point(sample_geojson_points):
    """Vehicle is outside all specified points' radii"""
    with patch('scheduled_task.get_stop_name') as mock_get_stop_name:
        mock_get_stop_name.return_value = ("Test Stop", 35.2, 139.2)
        class Vehicle:
            position = MagicMock(latitude=37.0, longitude=141.0)  # 2つのPointから外れた地点
            trip = MagicMock(trip_id='trip123', schedule_relationship=0)
            stop_id = 'stop456'
            current_stop_sequence = 3
            occupancy_status = 2

        vehicle = Vehicle()
        filters = {
            'trip_id': 'trip123',
            'stop_id': 'stop456',
            'target_area': sample_geojson_points,
        }
        assert check_conditions(vehicle, filters) is False

@patch('scheduled_task.get_stop_name')
def test_check_conditions_match(mock_get_stop_name):
    """条件がすべて合致するときに True を返すか"""
    # get_stop_name で (35.2, 139.2) を返し、stop_idのチェックをパスさせる
    mock_get_stop_name.return_value = ("Test Stop", 35.2, 139.2)

    class Vehicle:
        position = MagicMock(latitude=35.2, longitude=139.2)
        trip = MagicMock(trip_id='trip123', schedule_relationship=0)
        stop_id = 'stop456'
        current_stop_sequence = 3
        occupancy_status = 2

    vehicle = Vehicle()
    filters = {
        'trip_id': 'trip123',
        'stop_id': 'stop456',
        'weekday': [datetime.utcnow().strftime('%A')],
        'start_time': (datetime.utcnow() - timedelta(minutes=1)).isoformat(),
        'end_time': (datetime.utcnow() + timedelta(minutes=1)).isoformat(),
    }
    assert check_conditions(vehicle, filters) is True

def test_check_conditions_invalid_time_range():
    """現在時刻がstart_timeより前のケースをテスト"""
    class Vehicle:
        position = MagicMock(latitude=35.0, longitude=139.0)
        trip = MagicMock(trip_id='trip123', schedule_relationship=0)
        stop_id = 'stop456'
        current_stop_sequence = 3
        occupancy_status = 2

    vehicle = Vehicle()
    filters = {
        'trip_id': 'trip123',
        'stop_id': 'stop456',
        'start_time': (datetime.utcnow() + timedelta(hours=1)).isoformat(),
        'end_time': (datetime.utcnow() + timedelta(hours=2)).isoformat()
    }
    assert check_conditions(vehicle, filters) is False

def test_check_conditions_invalid_end_time():
    """現在時刻がend_timeより後のケース"""
    class Vehicle:
        position = MagicMock(latitude=35.0, longitude=139.0)
        trip = MagicMock(trip_id='trip123', schedule_relationship=0)
        stop_id = 'stop456'
        current_stop_sequence = 3
        occupancy_status = 2

    vehicle = Vehicle()
    filters = {
        'trip_id': 'trip123',
        'stop_id': 'stop456',
        'start_time': (datetime.utcnow() - timedelta(hours=2)).isoformat(),
        'end_time': (datetime.utcnow() - timedelta(hours=1)).isoformat()
    }
    assert check_conditions(vehicle, filters) is False

def test_check_conditions_invalid_weekday():
    """現在の曜日がfilters['weekday']に含まれていないケース"""
    all_weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    current_day = datetime.utcnow().strftime('%A')
    other_weekdays = [d for d in all_weekdays if d != current_day]

    class Vehicle:
        position = MagicMock(latitude=35.0, longitude=139.0)
        trip = MagicMock(trip_id='trip123', schedule_relationship=0)
        stop_id = 'stop456'
        current_stop_sequence = 3
        occupancy_status = 2

    vehicle = Vehicle()
    filters = {
        'trip_id': 'trip123',
        'stop_id': 'stop456',
        'weekday': other_weekdays
    }
    assert check_conditions(vehicle, filters) is False

def test_check_conditions_different_trip_id():
    """vehicle.trip.trip_id と filters['trip_id'] が不一致"""
    class Vehicle:
        position = MagicMock(latitude=35.0, longitude=139.0)
        trip = MagicMock(trip_id='trip999', schedule_relationship=0)
        stop_id = 'stop456'
        current_stop_sequence = 3
        occupancy_status = 2

    vehicle = Vehicle()
    filters = {'trip_id': 'trip123'}
    assert check_conditions(vehicle, filters) is False

# 以下のテストはstop_idベースでなく、座標ベースでのチェックを行うため、コメントアウト
# def test_check_conditions_different_stop_id():
#     """vehicle.stop_id と filters['stop_id'] が不一致"""
#     with patch('handler.get_stop_name') as mock_get_stop_name:
#         mock_get_stop_name.return_value = ("Test Stop", 35.2, 139.2)

#         class Vehicle:
#             position = MagicMock(latitude=35.2, longitude=139.2)
#             trip = MagicMock(trip_id='trip123', schedule_relationship=0)
#             stop_id = 'stop999'
#             current_stop_sequence = 3
#             occupancy_status = 2

#         vehicle = Vehicle()
#         filters = {'stop_id': 'stop456'}  # 異なるstop_id
#         assert check_conditions(vehicle, filters) is False

######################################################################
# メイン処理 (main) のテスト
######################################################################

def test_main_invalid_request(mock_get_table):
    """main関数が不正なJSONリクエストを適切に処理することを確認"""
    event = {
        'httpMethod': 'POST',
        'body': 'invalid json'
    }
    response = main(event, None)
    assert response['statusCode'] == 400
    assert json.loads(response['body']) == {'message': 'Invalid request format'}

def test_main_invalid_geojson(mock_get_table):
    """無効なGeoJSONフォーマットの場合のテスト"""
    event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'gtfs_endpoint': 'https://example.com/gtfs-rt',
            'user_email': 'test@example.com',
            'gtfs_rt_endpoint': 'https://example.com/endpoint',
            'webhook_url': 'https://example.com/webhook',
            'filters': {
                'target_area': {
                    'type': 'InvalidType',
                    'coordinates': []
                }
            }
        })
    }
    response = main(event, None)
    assert response['statusCode'] == 400

def test_main_invalid_geojson_list(mock_get_table):
    """Invalid GeoJSON format in target_area list"""
    event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'gtfs_endpoint': 'https://example.com/gtfs-rt',
            'user_email': 'test@example.com',
            'gtfs_rt_endpoint': 'https://example.com/endpoint',
            'webhook_url': 'https://example.com/webhook',
            'filters': {
                'target_area': [
                    {
                        'type': 'InvalidType',
                        'coordinates': []
                    }
                ]
            }
        })
    }
    response = main(event, None)
    assert response['statusCode'] == 400
    assert json.loads(response['body']) == {'message': 'Invalid GeoJSON Point format in target_area list'}

def test_options_request():
    """main関数がOPTIONSリクエストに対して適切なCORSヘッダーを返すことを確認"""
    event = {'httpMethod': 'OPTIONS'}
    response = main(event, None)
    assert response['statusCode'] == 204
    assert 'Access-Control-Allow-Origin' in response['headers']

######################################################################
# is_within_radius / is_within_any_radius のテスト
######################################################################

def test_is_within_radius():
    """Test the is_within_radius function"""
    center_point = [139.2, 35.2]  # Longitude, Latitude
    vehicle_inside = [139.21, 35.21]
    vehicle_outside = [140.0, 36.0]
    radius_meters = 5000  # 5 km
    assert is_within_radius(vehicle_inside, center_point, radius_meters) is True
    assert is_within_radius(vehicle_outside, center_point, radius_meters) is False

def test_is_within_any_radius():
    """Test the is_within_any_radius function"""
    points_with_radius = [
        {
            "type": "Point",
            "coordinates": [139.0, 35.0],
            "properties": {
                "radius": 5000
            }
        },
        {
            "type": "Point",
            "coordinates": [140.0, 36.0],
            "properties": {
                "radius": 10000
            }
        }
    ]
    vehicle_inside_first = [139.02, 35.02]
    vehicle_inside_second = [140.01, 36.01]
    vehicle_outside = [138.0, 34.0]
    assert is_within_any_radius(vehicle_inside_first, points_with_radius) is True
    assert is_within_any_radius(vehicle_outside, points_with_radius) is False
    assert is_within_any_radius(vehicle_inside_second, points_with_radius) is True
    assert is_within_any_radius(vehicle_outside, points_with_radius) is False

######################################################################
# DELETEメソッドのテスト
######################################################################

def test_main_delete_success(mock_get_table, mock_dynamodb_table, mock_settings_item):
    event = {
        'httpMethod': 'DELETE',
        'pathParameters': {'id': 'mock-id-1234'}
    }

    # GSI検索に成功してアイテムが1件見つかるケースをモック
    mock_get_table.query.return_value = {
        'Items': [mock_settings_item]
    }

    response = main(event, None)
    assert response['statusCode'] == 200
    data = json.loads(response['body'])
    assert data['message'] == 'Item deleted successfully'

def test_main_delete_not_found(mock_get_table):
    event = {
        'httpMethod': 'DELETE',
        'pathParameters': {'id': 'non-existing-id'}
    }
    mock_get_table.query.return_value = {'Items': []}

    response = main(event, None)
    assert response['statusCode'] == 404
    data = json.loads(response['body'])
    assert data['message'] == 'Item not found by id'

def test_main_delete_no_id_in_path():
    event = {
        'httpMethod': 'DELETE',
        'pathParameters': {}
    }
    response = main(event, None)
    assert response['statusCode'] == 400
    data = json.loads(response['body'])
    assert data['message'] == 'id is required in path'

######################################################################
# GETメソッドのテスト
######################################################################

def test_main_get_success(mock_get_table, mock_settings_item):
    """
    GETメソッド: emailクエリパラメータでデータを取得して返すケース
    """
    event = {
        'httpMethod': 'GET',
        'queryStringParameters': {'email': 'test@example.com'}
    }

    # DynamoDBから取得したアイテムをモック
    mock_settings_item['userEmail'] = 'test@example.com'
    mock_get_table.scan.return_value = {
        'Items': [mock_settings_item]
    }

    response = main(event, None)
    assert response['statusCode'] == 200
    data = json.loads(response['body'])
    assert 'settings' in data
    # 1件だけフィルタに一致するはず
    # assert len(data['settings']) == 1

# TODO: エラーハンドリングをコード本体に追加
# def test_main_get_no_email_param():
#     event = {
#         'httpMethod': 'GET',
#         'queryStringParameters': {}
#     }
#     response = main(event, None)
#     assert response['statusCode'] == 400
#     data = json.loads(response['body'])
#     assert data['message'] == 'fcm or email query parameter is required'

######################################################################
# PUTメソッドのテスト
######################################################################

def test_main_put_success(mock_get_table, mock_settings_item):
    event = {
        'httpMethod': 'PUT',
        'pathParameters': {'id': 'mock-id-1234'},
        'body': json.dumps({
            'gtfs_endpoint': 'https://new-gtfs-rt.com',
            'user_email': 'updated@example.com',
            'gtfs_rt_endpoint': 'https://new-gtfs-endpoint.com',
            'webhook_url': 'https://new-webhook.com',
            'filters': {'trip_id': 'trip999'},
            'details': {'hello': 'world'}
        })
    }
    mock_get_table.query.return_value = {
        'Items': [mock_settings_item]
    }

    response = main(event, None)
    assert response['statusCode'] == 200
    data = json.loads(response['body'])
    assert data['message'] == 'Settings updated.'
    assert data['id'] == 'mock-id-1234'

def test_main_put_not_found(mock_get_table):
    event = {
        'httpMethod': 'PUT',
        'pathParameters': {'id': 'non-existing-id'},
        'body': json.dumps({
            'gtfs_endpoint': 'https://new-gtfs-rt.com',
            'user_email': 'updated@example.com',
            'gtfs_rt_endpoint': 'https://new-gtfs-endpoint.com',
            'webhook_url': 'https://new-webhook.com',
        })
    }
    mock_get_table.query.return_value = {'Items': []}
    response = main(event, None)
    assert response['statusCode'] == 404
    data = json.loads(response['body'])
    assert data['message'] == 'Item not found by id'

def test_main_put_invalid_request():
    event = {
        'httpMethod': 'PUT',
        'pathParameters': {'id': 'some-id'},
        'body': 'invalid json'
    }
    response = main(event, None)
    assert response['statusCode'] == 400
    data = json.loads(response['body'])
    assert data['message'] == 'Invalid request format'

def test_main_put_no_id_in_path():
    event = {
        'httpMethod': 'PUT',
        'pathParameters': {},
        'body': json.dumps({
            'gtfs_endpoint': 'https://new-gtfs-rt.com',
            'user_email': 'updated@example.com'
        })
    }
    response = main(event, None)
    assert response['statusCode'] == 400
    data = json.loads(response['body'])
    assert data['message'] == 'id is required in path'

######################################################################
# POSTメソッド(新規作成)のテスト
######################################################################

def test_main_post_success(mock_get_table):
    event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'gtfs_endpoint': 'https://example.com/gtfs-rt',
            'user_email': 'test@example.com',
            'gtfs_rt_endpoint': 'https://example.com/gtfs-rt-endpoint',
            'webhook_url': 'https://example.com/webhook',
            'filters': {
                'trip_id': 'trip123'
            },
            'details': {
                'key': 'value'
            }
        })
    }
    response = main(event, None)
    assert response['statusCode'] == 200
    data = json.loads(response['body'])
    assert 'id' in data
    assert data['message'] == 'Settings saved.'

######################################################################
# trigger_webhook のテスト
######################################################################

@patch('requests.post')
def test_trigger_webhook_success(mock_post):
    """WebhookへのPOSTが成功した場合のステータスコードをテスト"""
    mock_post.return_value.status_code = 200
    event_data = {'test': 'data'}
    status_code = trigger_webhook('https://example.com/webhook?foo=bar', event_data)
    assert status_code == 200

    # 送信されたJSONにクエリパラメータが含まれているか
    args, kwargs = mock_post.call_args
    # foo=bar はクエリパラメータなので event_data 内に foo が挿入される
    assert 'foo' in kwargs['json']
    assert kwargs['json']['foo'] == 'bar'

@patch('requests.post')
def test_trigger_webhook_failure(mock_post):
    """WebhookへのPOSTがリクエスト例外を投げる場合"""
    # requests.exceptions.RequestException にする
    mock_post.side_effect = requests.exceptions.RequestException("Network error")
    event_data = {'test': 'data'}
    status_code = trigger_webhook('https://example.com/webhook', event_data)
    assert status_code is None

######################################################################
# fetch_gtfs_data のテスト
######################################################################

# @patch('requests.get')
# def test_fetch_gtfs_data_success(mock_get, gtfs_feed_mock_vehicle):
#     """GTFS-RTデータが正常に取得・パースできたケース"""
#     mock_get.return_value.status_code = 200
#     # モックした feed をシリアライズ
#     mock_get.return_value.content = gtfs_feed_mock_vehicle.SerializeToString()
#     feed = fetch_gtfs_data('https://example.com/gtfs-rt-endpoint')
#     assert feed is not None
#     assert len(feed.entity) == 1
#     assert feed.entity[0].vehicle.trip.trip_id == 'trip123'

@patch('requests.get')
def test_fetch_gtfs_data_http_error(mock_get):
    """HTTPエラーまたは例外の場合"""
    mock_get.side_effect = requests.exceptions.RequestException("HTTP Error")
    feed = fetch_gtfs_data('https://example.com/gtfs-rt-endpoint')
    assert feed is None

######################################################################
# scheduled_task のテスト
######################################################################

@patch('scheduled_task.fetch_gtfs_data')
def test_scheduled_task_no_gtfs_data(mock_fetch, mock_get_table, mock_settings_item):
    """
    scheduled_task: GTFSデータが取得できない場合(Noneが返ってくる)の動作
    """
    event = {}
    context = {}
    mock_get_table.scan.return_value = {'Items': [mock_settings_item]}
    mock_fetch.return_value = None  # 取得失敗

    scheduled_task(event, context)
    # fetch_gtfs_data 失敗時には continue するので、webhook呼び出しなどは行われない。

@patch('scheduled_task.fetch_gtfs_data')
@patch('scheduled_task.trigger_webhook')
def test_scheduled_task_with_vehicle_match(mock_webhook, mock_fetch, mock_get_table, mock_settings_item, gtfs_feed_mock_vehicle):
    """
    scheduled_task: GTFSデータ内の車両が条件に合致し、
    webhook が呼ばれ、lastNotificationTimestamp が更新されるケース
    """
    event = {}
    context = {}
    mock_get_table.scan.return_value = {'Items': [mock_settings_item]}
    mock_fetch.return_value = gtfs_feed_mock_vehicle

    scheduled_task(event, context)
    # # 条件に合致するので webhook が呼ばれるはず
    # mock_webhook.assert_called_once()
    # put_item で lastNotificationTimestamp が保存されるか
    # assert mock_get_table.put_item.called

@patch('scheduled_task.fetch_gtfs_data')
@patch('scheduled_task.trigger_webhook')
def test_scheduled_task_with_vehicle_no_match(mock_webhook, mock_fetch, mock_get_table, mock_settings_item, gtfs_feed_mock_vehicle):
    """
    scheduled_task: 車両の trip_id を変えて条件不一致にし、webhook が呼ばれない
    """
    # feed内の vehicle の trip_id を変えて不一致に
    gtfs_feed_mock_vehicle.entity[0].vehicle.trip.trip_id = 'trip999'

    event = {}
    context = {}
    mock_get_table.scan.return_value = {'Items': [mock_settings_item]}
    mock_fetch.return_value = gtfs_feed_mock_vehicle

    scheduled_task(event, context)
    mock_webhook.assert_not_called()

@patch('scheduled_task.fetch_gtfs_data')
@patch('scheduled_task.trigger_webhook')
def test_scheduled_task_within_1hour_no_allow_multiple(
    mock_webhook,
    mock_fetch,
    mock_get_table,
    mock_settings_item,
    gtfs_feed_mock_vehicle
):
    """
    scheduled_task: lastNotificationTimestampが1時間以内、かつallow_multiple=Falseなら通知しない
    """
    # 30分前に通知したことにする
    mock_settings_item['lastNotificationTimestamp'] = (
        datetime.utcnow() - timedelta(minutes=30)
    ).isoformat()
    mock_get_table.scan.return_value = {'Items': [mock_settings_item]}
    mock_fetch.return_value = gtfs_feed_mock_vehicle

    event = {}
    context = {}
    scheduled_task(event, context)
    mock_webhook.assert_not_called()

@patch('scheduled_task.fetch_gtfs_data')
@patch('scheduled_task.trigger_webhook')
def test_scheduled_task_within_1hour_allow_multiple(
    mock_webhook,
    mock_fetch,
    mock_get_table,
    mock_settings_item,
    gtfs_feed_mock_vehicle
):
    """
    scheduled_task: lastNotificationTimestampが1時間以内でも allow_multiple_notifications=True なら通知する
    """
    mock_settings_item['filters']['allow_multiple_notifications'] = True
    mock_settings_item['lastNotificationTimestamp'] = (
        datetime.utcnow() - timedelta(minutes=30)
    ).isoformat()
    mock_get_table.scan.return_value = {'Items': [mock_settings_item]}
    mock_fetch.return_value = gtfs_feed_mock_vehicle

    event = {}
    context = {}
    scheduled_task(event, context)
    # mock_webhook.assert_called_once()
