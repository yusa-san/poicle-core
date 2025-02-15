import json
import os
import smtplib
from email.mime.text import MIMEText
import requests
import firebase_admin
from firebase_admin import credentials
from firebase_admin import messaging

def initialize_app(path:str):
  cred = credentials.Certificate(path)
  if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

def send_message( registration_token:str, title:str, body:str):
  print(f"registration_token: {registration_token}")
  message = messaging.Message(
      data = {
        "title": title,
        "body": body
      },
      token=registration_token,
  )
  response = messaging.send(message)
  print('Successfully sent message:', response)

def create_response(status_code, body, headers=None):
    """CORS対応のレスポンスを生成"""
    response = {
        'statusCode': status_code,
        'body': json.dumps(body)
    }
    # CORSヘッダーを追加
    if headers:
        response['headers'] = headers
    else:
        response['headers'] = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,DELETE'
        }
    return response

def post_to_mattermost(webhook_url, content):
    """MatterMostに通知を投稿"""
    headers = {'Content-Type': 'application/json'}
    data = {
        "text": content
    }

    try:
        response = requests.post(webhook_url, headers=headers, json=data)
        response.raise_for_status()
        return response.status_code, "Message posted to MatterMost"
    except requests.exceptions.RequestException as e:
        print(f"Error posting to MatterMost: {str(e)}")
        return 500, f"Error posting to MatterMost: {str(e)}"

def send_email(smtp_host, smtp_port, smtp_user, smtp_password, to_email, subject, body):
    """SMTPを使用してメールを送信"""
    try:
        # メール内容を設定
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = os.getenv('SENDER_EMAIL')
        msg['To'] = to_email

        # SMTPサーバーに接続してメールを送信
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(msg['From'], to_email, msg.as_string())
        print(f"Email sent to {to_email}")
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        raise

def handler(event, context):
    """MatterMostおよびメール通知を処理するLambda関数"""
    print(f"Received event: {event}")

    try:
        # POSTリクエストボディを解析
        body = json.loads(event['body'])
        print(f"Parsed body: {body}")

        # MatterMost Webhook URLを環境変数から取得
        mattermost_webhook_url = os.getenv('MATTERMOST_WEBHOOK_URL')

        if not mattermost_webhook_url:
            print("Error: MATTERMOST_WEBHOOK_URL is not set.")
            return create_response(500, {'message': 'MATTERMOST_WEBHOOK_URL is not set'})

        # SMTP情報を環境変数から取得
        smtp_host = os.getenv('SMTP_HOST')
        smtp_port = int(os.getenv('SMTP_PORT', 587))
        smtp_user = os.getenv('SMTP_USER')
        smtp_password = os.getenv('SMTP_PASSWORD')

        if not all([smtp_host, smtp_port, smtp_user, smtp_password]):
            print("Error: SMTP configuration is not fully set.")
            return create_response(500, {'message': 'SMTP configuration is not fully set'})

        alarm_settings = body.get('alarm_settings', {})

        label = alarm_settings.get('details', {}).get('label', 'PoiCle')
        description = alarm_settings.get('details', {}).get('describe', 'PoiCleからの通知です。')
        # trip_short_name = alarm_settings.get('details', {}).get('trip_short_name', '不明')
        # trip_headsign = alarm_settings.get('details', {}).get('trip_headsign', '不明')
        # stop_name = alarm_settings.get('details', {}).get('stop_name', '不明')

        # if stop_name == '':
        #     stop_name = '海が見えるスポット'

        userEmailId = alarm_settings.get('userEmail', '')

        subject = f"{label}"
        email_body = (
            f"{description}"
            f"\n\n"
            f"この通知メールの受信を止める場合はこちらのURLをクリックしてください。\n"
            f"https://m8aeo2cuti.execute-api.ap-northeast-1.amazonaws.com/prod/delete-alarm?userEmail={userEmailId}"
            # f"[開発用詳細情報]\n```json\n{json.dumps(body, indent=2, ensure_ascii=False)}\n```"
        )
        fcm_body = (
            f"{description}"
        )

        if 'email' in body:
            email = body.get('email', '').split('@')[0] + '@' + body.get('email', '').split('@')[1]
            send_email(smtp_host, smtp_port, smtp_user, smtp_password, email, subject, email_body)
            print('email sended.')
        elif 'fcm' in body:
            initialize_app("./firebase.json")
            fcm = body.get('fcm', '')
            fcm = fcm.replace('{', '').replace('}', '')
            send_message(fcm, label, fcm_body)

        post_to_mattermost(mattermost_webhook_url, email_body)

        return create_response(200, {'message': 'Email sent successfully'})

    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {str(e)}")
        return create_response(400, {'message': 'Invalid JSON format'})
    except KeyError as e:
        print(f"Missing key in the request: {str(e)}")
        return create_response(400, {'message': f'Missing key in the request: {str(e)}'})
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return create_response(500, {'message': f'Unexpected error: {str(e)}'})
