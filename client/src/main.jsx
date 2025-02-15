import React, { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import Logo from './assets/poicle.svg';

function GuidePage() {
  // モーダルを開閉するためのステート
  const [showMapModal, setShowMapModal] = useState(false);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <div style={{ margin: '20px 0' }}>
        <img src={Logo} alt="PoiCle" style={{height:'20vh'}}/><br/><br/>

        <div>
        <p>電車やバスのリアルタイム位置情報で通知を受け取ろう</p>
        </div>

        {/* ログインしてWebから使うボタン */}
        <button
          onClick={() => {
            // クエリパラメータからlpがある場合は削除
            const urlParams = new URLSearchParams(window.location.search);
            const jwtParam = urlParams.get('jwt');
            const deviceIdParam = urlParams.get('device_id');
            if(!jwtParam && !deviceIdParam){
              window.location.href = 'https://takoyaki3-auth.web.app/?r=' + window.location.href;
            } else {
              urlParams.delete('lp');
              window.location.search = urlParams.toString();
            }
          }}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', width: '100%' }}
        >
          ログインしてWebから使う<br/>メールで通知
        </button>
        <br/><br/>

        {/* Android アプリをインストールするボタン */}
        <button
          onClick={() => {
            window.location.href = 'https://play.google.com/store/apps/details?id=window_grapher.com.alarm&hl=ja';
          }}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', width: '100%' }}
        >
          Andoroidアプリをインストール<br/>振動あり
        </button>
        <br/><br/>

        {/* 「海が見える所マップを見る」ボタン -> モーダル表示 */}
        <button
          onClick={() => {
            setShowMapModal(true);
          }}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', width: '100%' }}
        >
          海が見える所マップを見る<br/>ログイン不要
        </button>
        <br/><br/>

        {/* デモ動画を見るボタン */}
        <button
          onClick={() => {
            window.location.href = 'https://www.youtube.com/shorts/FO8chV3eLI8';
          }}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', width: '100%' }}
        >
          デモ動画を見る<br/>YouTube
        </button>
        <br/><br/>
      </div>

      {/* モーダル部分 (showMapModal が true の時だけ表示) */}
      {showMapModal && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
              textAlign: 'center'
            }}
          >
            <h2>海が見える所マップ</h2>
            <p>以下から選択してください</p>
            <br/>
            {/* 3つのマップボタン */}
            <div style={{ marginBottom: '10px' }}>
              <button
                onClick={() => {
                  window.location.href = 'https://map.poicle.window-grapher.com/?mapid=1&lat=26.55&lon=127.97&radius=20';
                }}
                style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', width: '100%' }}
              >
                やんばる急行バスから海が見える所マップ
              </button>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <button
                onClick={() => {
                  window.location.href = 'https://map.poicle.window-grapher.com/?mapid=2&lat=35.448530&lon=139.644234&radius=5';
                }}
                style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', width: '100%' }}
              >
                あかいくつから海が見える所マップ
              </button>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <button
                onClick={() => {
                  window.location.href = 'https://map.poicle.window-grapher.com/?mapid=3&lat=35.214647&lon=139.854583&radius=50';
                }}
                style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', width: '100%' }}
              >
                JR内房線から海が見える所マップ
              </button>
            </div>
            <br/>
            {/* モーダルを閉じるボタン */}
            <button
              onClick={() => setShowMapModal(false)}
              style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RootComponent() {
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const jwtParam = urlParams.get('jwt');
    const deviceIdParam = urlParams.get('device_id');
    const lp = urlParams.get('lp');

    // jwt が URL パラメータにある場合は localStorage に保存
    if (jwtParam) {
      localStorage.setItem('jwt', 'jwtParam');
    }

    // // device_id がある場合も同様に保存（必要に応じて削除や調整してください）
    // if (deviceIdParam) {
    //   localStorage.setItem('device_id', deviceIdParam);
    // }

    // localStorage から jwt / device_id を取得
    const storedJwt = localStorage.getItem('jwt');
    // const storedDeviceId = localStorage.getItem('device_id');

    // jwt も device_id も無い場合はガイドを表示
    if ((!jwtParam && !deviceIdParam && !storedJwt) || lp) {
      setShowGuide(true);
    } else {
      if (!jwtParam && !deviceIdParam) {
        window.location.href = 'https://takoyaki3-auth.web.app/?r=' + window.location.href;
      }
      // そうでなければそのまま App を表示
    }
  }, []);

  if (showGuide) {
    return <GuidePage />;
  }

  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>
);
