// src/App.jsx
import React, { useState } from 'react';
import Settings from './components/Settings';
import './App.css';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div>
      <Settings />

      {/* フッターのリンク */}
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          width: '100%',
          backgroundColor: '#f8f9fa',
          textAlign: 'center',
          padding: '10px 0',
          borderTop: '1px solid #e7e7e7',
        }}
      >
        <span
          style={{
            color: '#007BFF',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
          onClick={handleOpenModal}
        >
          利用データについて
        </span>
      </footer>

      {/* モーダルウィンドウ */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '90%',
              textAlign: 'center',
            }}
          >
            <h2>利用データについて</h2>
            <p>
本アプリケーション等が利用するJR東日本および横浜市営バスのデータは、公共交通交通オープンデータセンターにおいて提供されるものです。<br/>
やんばる急行バスのデータは、GTFSデータレポジトリにおいて提供されるものです。<br/>
公共交通事業者により提供されたデータを元にしていますが、必ずしも正確・完全なものとは限りません。<br/>
本アプリケーションの表示内容について、公共交通事業者への直接の問合せは行わないでください。<br/>
本アプリケーションではリアルタイムデータを活用していますが、システム上、一定の遅延が生じます。ご了承ください。<br/>
本アプリケーションに関するお問い合わせは、以下のメールアドレスにお願いします。<br/>
時刻表データは2025年1月16日に取得したデータを使用しています。<br/>
<br/><br/>
poicle@window-grapher.com

<br/><br/>
なお、不具合により正確な情報がトリガーされない場合があります。ご了承ください。<br/>
</p>
            <button
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                backgroundColor: '#007BFF',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
              onClick={handleCloseModal}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
