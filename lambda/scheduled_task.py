import requests
import boto3
import os

from decimal import Decimal
from datetime import datetime, timedelta
from collections import defaultdict
from google.transit import gtfs_realtime_pb2
from utils.geo import is_within_radius, is_within_any_radius
from urllib.parse import urlparse, parse_qs, urlunparse
from utils.db import get_table, get_all_settings

def get_stop_name(stop_id, gtfs_rt_endpoint):
    api_base_url = os.getenv('API_BASE_URL')
    if gtfs_rt_endpoint == f'{api_base_url}/odpt-challenge-2024-jreast_odpt_train_vehicle':
        gtfs_id_temp = 'odpt_jreast'
    elif gtfs_rt_endpoint == f'{api_base_url}/odpt-yokohama-city-bus-vehicle-position':
        gtfs_id_temp = 'data'
    elif gtfs_rt_endpoint == f'{api_base_url}/odpt-challenge-2024-tobu_odpt_train_vehicle':
        gtfs_id_temp = 'odpt_tobu'
    elif gtfs_rt_endpoint == 'https://gtfs.yanbaru-bus-navi.com/gtfs-rt/yanbaru/vehicle_position.pb':
        gtfs_id_temp = 'yanbaru-expressbus'
    try:
        api_url = f"{api_base_url}/getBusStops?gtfs_id=" + gtfs_id_temp
        response = requests.get(api_url)
        response.raise_for_status()
        stops_data = response.json()
        print('Stops data retrieved successfully from BuTTER API')

        for stop in stops_data:
            if stop['stop_id'] == stop_id:
                stop_name = stop['stop_name']
                stop_lat = stop['stop_lat']
                stop_lon = stop['stop_lon']
                print(f'Found stop name: {stop_name} for stop ID: {stop_id}')
                return stop_name, stop_lat, stop_lon

        print(f'Stop ID: {stop_id} not found')
        return None, None, None

    except Exception as e:
        print(f'Error fetching stop name for stop ID: {stop_id}, Error: {str(e)}')
        return None, None, None

def fetch_gtfs_data(gtfs_endpoint):
    """GTFS-RTエンドポイントからプロトコルバッファデータを取得しデコード"""
    print(f"Fetching GTFS-RT data from endpoint: {gtfs_endpoint}")
    try:
        response = requests.get(gtfs_endpoint)
        response.raise_for_status()
        print(f"HTTP status code: {response.status_code}")

        # GTFS-RTプロトコルバッファをデコード
        feed = gtfs_realtime_pb2.FeedMessage()  # GTFS-RT用プロトコルバッファメッセージ
        feed.ParseFromString(response.content)  # バイナリデータを解析

        print(f"GTFS-RT data parsed successfully")
        return feed
    except requests.exceptions.RequestException as e:
        print(f"Error fetching GTFS-RT data: {str(e)}")
        return None
    except Exception as e:
        print(f"Error parsing GTFS-RT data: {str(e)}")
        return None

def check_conditions(vehicle, filters, gtfs_rt_endpoint):
    """フィルター条件をチェック"""
    # print(f"Checking conditions for vehicle: {vehicle}")
    # 現在の日時と曜日
    now = datetime.utcnow()
    current_weekday = now.strftime('%A')  # 'Monday', 'Tuesday', etc.

    # フィルター条件の取得
    trip_id_filter = filters.get('trip_id')
    stop_id_filter = filters.get('stop_id')
    date_filter = filters.get('date')
    start_time_filter = filters.get('start_time')
    end_time_filter = filters.get('end_time')
    weekday_filter = filters.get('weekday')
    target_area = filters.get('target_area')

    # 条件チェック
    # trip_id のチェック
    if trip_id_filter and vehicle.trip.trip_id != trip_id_filter:
        # print(f"Trip ID does not match: {vehicle.trip.trip_id} != {trip_id_filter}")
        return False

    # stop_id のチェック
    # print('stop@@@@@@@@@@@@@',stop_id_filter)
    if stop_id_filter:
        stop_name, stop_lat, stop_lon = get_stop_name(stop_id_filter, gtfs_rt_endpoint)
        # print("stop lat lon:",stop_lat,stop_lon)
        r = 100

        # やんばる急行バスの場合のみ、半径を3kmに設定。やんばる急行バスは緯度が30度以下のはず！
        if stop_lat:
            # stop_latをfloatに変換
            if float(stop_lat) < 30.0:
                r = 3000

        if not stop_name or not is_within_radius([vehicle.position.latitude, vehicle.position.longitude], [stop_lat, stop_lon], r):
            print(f"Vehicle is not within 1km radius of stop ID: {stop_id_filter}")
            return False

    # date のチェック
    if date_filter:
        date_filter_dt = datetime.strptime(date_filter, '%Y-%m-%d').date()
        if now.date() != date_filter_dt:
            # print(f"Date does not match: {now.date()} != {date_filter_dt}")
            return False

    # start_time と end_time のチェック
    if start_time_filter:
        start_time_dt = datetime.fromisoformat(start_time_filter)
        if now < start_time_dt:
            # print(f"Current time is before start time: {now} < {start_time_dt}")
            return False

    if end_time_filter:
        end_time_dt = datetime.fromisoformat(end_time_filter)
        if now > end_time_dt:
            # print(f"Current time is after end time: {now} > {end_time_dt}")
            return False

    # weekday のチェック
    if weekday_filter and current_weekday not in weekday_filter:
        # print(f"Weekday does not match: {current_weekday} not in {weekday_filter}")
        return False

    # target_area のチェック (GeoJSON Point with radius version)
    if target_area:
        vehicle_lon = vehicle.position.longitude
        vehicle_lat = vehicle.position.latitude
        vehicle_location = [vehicle_lon, vehicle_lat]

        if isinstance(target_area, list):
            # List of points
            points_with_radius = []
            for point in target_area:
                # Validate GeoJSON Point format
                if point.get('type') != 'Point' or 'coordinates' not in point:
                    # print("Invalid GeoJSON Point format in list")
                    return False
                if 'radius' not in point.get('properties', {}):
                    # print("Radius not specified in target_area properties")
                    return False
                points_with_radius.append(point)
            if not is_within_any_radius(vehicle_location, points_with_radius):
                # print("Vehicle is not within any of the specified radii")
                return False
        elif isinstance(target_area, dict):
            # Single point
            if target_area.get('type') != 'Point' or 'coordinates' not in target_area:
                # print("Invalid GeoJSON Point format")
                return False
            if 'radius' not in target_area.get('properties', {}):
                # print("Radius not specified in target_area properties")
                return False
            center_point = target_area['coordinates']
            radius_meters = target_area['properties']['radius']
            if not is_within_radius(vehicle_location, center_point, radius_meters):
                # print("Vehicle is not within the specified radius")
                return False
        else:
            print("Invalid target_area format")
            return False

    # print("All conditions matched")
    return True

def trigger_webhook(webhook_url, event_data):
    """条件に一致した場合にWebHookを呼び出す"""
    print(f"Triggering webhook: {webhook_url} with event_data: {event_data}")
    try:
        # URLを解析
        parsed_url = urlparse(webhook_url)
        query_params = parse_qs(parsed_url.query)

        # クエリパラメータが存在する場合、event_dataに追加してPOST
        if query_params:
            # print(f"Found query parameters: {query_params}")
            event_data.update({key: values[0] if len(values) == 1 else values for key, values in query_params.items()})
            # クエリパラメータを削除したURLを再構築
            webhook_url = urlunparse(parsed_url._replace(query=""))

        response = requests.post(webhook_url, json=event_data)
        # print(f"Webhook response status code: {response.status_code}")
        return response.status_code
    except requests.exceptions.RequestException as e:
        print(f"Error triggering webhook: {str(e)}")
        return None

def scheduled_task(event, context):
    """スケジュール実行されるLambda関数"""
    print("Scheduled task started")
    settings_table = get_table()
    settings_list = get_all_settings()

    # GTFS-RT URLごとに設定をグループ化
    settings_by_gtfs_rt_endpoint = defaultdict(list)
    for setting in settings_list:
        gtfs_rt_endpoint = setting['gtfsRtEndpoint']
        settings_by_gtfs_rt_endpoint[gtfs_rt_endpoint].append(setting)

    api_base_url = os.getenv('API_BASE_URL')
    for gtfs_rt_endpoint, settings in settings_by_gtfs_rt_endpoint.items():
        print(f"Processing GTFS-RT URL: {gtfs_rt_endpoint}")
        # GTFS-RTデータの取得
        gtfs_rt_endpoint = settings[0]['gtfsRtEndpoint']
        # gtfs_rt_endpoint = 'https://pub-fe12e25cb8d7447bab4c05076e1a5e6b.r2.dev/2024/vehicle_position.pb'
        if gtfs_rt_endpoint == 'odpt_jreast':
            gtfs_rt_endpoint = f'{api_base_url}/odpt-challenge-2024-jreast_odpt_train_vehicle'
        elif gtfs_rt_endpoint == 'odpt_tobu':
            gtfs_rt_endpoint = f'{api_base_url}/odpt-challenge-2024-tobu_odpt_train_vehicle'
        elif gtfs_rt_endpoint == 'data':
            gtfs_rt_endpoint = f'{api_base_url}/odpt-yokohama-city-bus-vehicle-position'
        elif gtfs_rt_endpoint == 'yanbaru-expressbus':
            gtfs_rt_endpoint = 'https://gtfs.yanbaru-bus-navi.com/gtfs-rt/yanbaru/vehicle_position.pb'

        gtfs_data = fetch_gtfs_data(gtfs_rt_endpoint)

        if gtfs_data is None:
            print(f"Failed to fetch GTFS-RT data for URL: {gtfs_rt_endpoint}")
            continue

        # GTFS-RTデータ内の車両情報を取得
        for entity in gtfs_data.entity:
            if entity.HasField('vehicle'):
                vehicle = entity.vehicle
                vehicle_id = vehicle.vehicle.id
                # print(f"Processing vehicle: {vehicle_id}")

                for setting in settings:
                    if 'userEmail' not in setting or 'webhook_url' not in setting or 'filters' not in setting:
                        # print("Skipping setting without userEmail or webhook_url or filters")
                        continue
                    user_email = setting['userEmail']
                    webhook_url = setting['webhook_url']
                    filters = setting.get('filters', {})

                    # 新たに追加: 複数通知可否フラグ取得（デフォルトfalse想定）
                    allow_multiple = filters.get('allow_multiple_notifications', False)

                    if check_conditions(vehicle, filters, gtfs_rt_endpoint):
                        # # 通知抑止ロジック:
                        # # lastNotificationTimestampを取得
                        last_ts_str = setting.get('lastNotificationTimestamp')
                        now = datetime.utcnow()

                        if last_ts_str:
                            last_ts = datetime.fromisoformat(last_ts_str)
                            delta = now - last_ts
                            # 1時間以内の再通知制御
                            if delta < timedelta(hours=1) and not allow_multiple:
                                # print(f"Skipping notification since last was {delta} ago and multiple not allowed.")
                                continue

                        # 条件に一致、かつ通知可能な場合、WebHookを呼び出す
                        event_data = {
                            'vehicle_id': vehicle_id,
                            'location': {
                                'latitude': Decimal(str(vehicle.position.latitude)),
                                'longitude': Decimal(str(vehicle.position.longitude)),
                            },
                            'stop_id': vehicle.stop_id,
                            'trip_id': vehicle.trip.trip_id,
                            'schedule_relationship': vehicle.trip.schedule_relationship,
                            'current_stop_sequence': vehicle.current_stop_sequence,
                            'occupancy_status': vehicle.occupancy_status,
                            'timestamp': now.isoformat(),
                            'event_details': {},
                            'alarm_settings': setting  # 新たに追加: アラーム設定の詳細情報を追加
                        }
                        trigger_webhook(webhook_url, event_data)

                        setting['lastNotificationTimestamp'] = now.isoformat()
                        settings_table.put_item(Item={
                            'gtfsRtEndpoint': setting['gtfsRtEndpoint'],
                            'userEmail': setting['userEmail'],
                            'gtfsEndpoint': setting['gtfsEndpoint'],
                            'id': setting['id'],
                            'webhook_url': setting['webhook_url'],
                            'filters': setting['filters'],
                            'details': setting['details'],
                            'lastNotificationTimestamp': now.isoformat()
                        })
                        print(f"Webhook triggered for vehicle {vehicle_id} and user {user_email}")
                    # else:
                        # print(f"Vehicle {vehicle_id} did not match the conditions for user {user_email}")

    print("Scheduled task completed")
