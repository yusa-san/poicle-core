// client/src/components/Settings.jsx
import React, { useState, useEffect } from 'react';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/ace';                  // Ace エディターの基本設定
import 'ace-builds/src-noconflict/mode-json';            // JSON モードをインポート
import 'ace-builds/src-noconflict/theme-github';         // テーマをインポート
import 'ace-builds/src-noconflict/ext-language_tools';   // 自動補完機能をインポート
import 'ace-builds/src-noconflict/worker-json';          // JSON 用のワーカーをインポート
import './Settings.css';

import AdvancedAlertEditor from './AdvancedAlertEditor';
import BoardingAlightingAlertEditor from './BoardingAlightingAlertEditor';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Box,
  Paper,
  DialogActions,
  Button
} from '@mui/material';

import { createTheme, ThemeProvider } from '@mui/material/styles';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const theme = createTheme({
  palette: {
    background: {
      default: '#FFFFFF',
      paper: '#FFFFFF'
    },
    primary: {
      main: '#2196F3'
    }
  },
  components: {
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#FFFFFF',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none'
        }
      }
    }
  }
});

const Settings = () => {
  // JWT または device_id からメール相当の識別子を取得
  const getUserIdentifier = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const jwt = urlParams.get('jwt');
    const deviceId = urlParams.get('device_id');

    if (jwt) {
      try {
        const base64Url = jwt.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        if (decoded.email) {
          return decoded.email;
        }
      } catch (e) {
        console.error('Invalid JWT token:', e);
      }
    }

    if (deviceId) {
      return `${deviceId}@fcm`;
    }

    return 'user@example.com';
  };

  const email = getUserIdentifier();
  const trigger_id = Math.random();

  // モーダルを開閉するためのステート
  const [showMapModal, setShowMapModal] = useState(false);

  const [settingsList, setSettingsList] = useState([]);
  const [jsonData, setJsonData] = useState(`{
    "gtfs_rt_endpoint": "odpt_jreast",
    "user_email": "${email}@${trigger_id}",
    "gtfs_endpoint": "odpt_jreast",
    "webhook_url": "https://example.com/webhook",
    "filters": {
      "trip_id": "trip123",
      "stop_id": "stop456"
    },
    "details": {
      "describe": "トリガーの説明をここに記載"
    }
  }`);
  const [statusMessage, setStatusMessage] = useState('');
  const [editingSetting, setEditingSetting] = useState(null);
  const [showNewAlertModal, setShowNewAlertModal] = useState(false);
  const [modalTab, setModalTab] = useState('table'); // 'table' or 'geo'
  const [showJsonEditorModal, setShowJsonEditorModal] = useState(false); // JSON編集モーダル
  const [initialNotifyType, setInitialNotifyType] = useState(null); // 追加: モーダル表示時の初期通知タイプ

  // カードごとに "JSON表示" or "UI表示" をタブで切り替え
  const [viewModeMap, setViewModeMap] = useState({});
  const handleCardTabChange = (settingId, newValue) => {
    setViewModeMap((prev) => ({ ...prev, [settingId]: newValue }));
  };

  const MAIN_API_ENDPOINT = import.meta.env.VITE_MAIN_API_ENDPOINT;

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(
          `${MAIN_API_ENDPOINT}/settings?email=${email}`
        );
        if (response.ok) {
          const data = await response.json();
          setSettingsList(data.settings || []);
        } else {
          console.error('Failed to fetch settings:', response.status, response.statusText);
          setStatusMessage(
            `設定の取得に失敗しました。 HTTPステータス: ${response.status} ${response.statusText}`
          );
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        setStatusMessage('設定の取得中にエラーが発生しました。');
      }
    };
    fetchSettings();
  }, [email]);

  const handleSubmit = async () => {
    try {
      const parsedData = JSON.parse(jsonData);
      setStatusMessage('データを送信中...');

      const response = await fetch(
        `${MAIN_API_ENDPOINT}/settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(parsedData)
        }
      );
      if (response.ok) {
        setStatusMessage('設定が正常に保存されました！');
        const fetchSettingsResponse = await fetch(
          `${MAIN_API_ENDPOINT}/settings?email=${email}`
        );
        if (fetchSettingsResponse.ok) {
          const data = await fetchSettingsResponse.json();
          setSettingsList(data.settings || []);
        } else {
          console.error(
            'Failed to fetch settings after submit:',
            fetchSettingsResponse.status,
            fetchSettingsResponse.statusText
          );
          setStatusMessage(
            `設定の取得に失敗しました。 HTTPステータス: ${fetchSettingsResponse.status} ${fetchSettingsResponse.statusText}`
          );
        }
      } else {
        console.error('Failed to save settings:', response.status, response.statusText);
        setStatusMessage(
          `設定の保存に失敗しました。 HTTPステータス: ${response.status} ${response.statusText}`
        );
      }
    } catch (e) {
      setStatusMessage('JSON形式が正しくありません。入力を修正してください。');
    }
  };

  const handleDelete = async (id) => {
    setStatusMessage('設定を削除中...');
    try {
      const response = await fetch(
        `${MAIN_API_ENDPOINT}/settings/${id}`,
        {
          method: 'DELETE'
        }
      );
      if (response.ok) {
        setStatusMessage('設定が正常に削除されました！');
        const fetchSettingsResponse = await fetch(
          `${MAIN_API_ENDPOINT}/settings?email=${email}`
        );
        if (fetchSettingsResponse.ok) {
          const data = await fetchSettingsResponse.json();
          setSettingsList(data.settings || []);
        } else {
          console.error(
            'Failed to fetch settings after delete:',
            fetchSettingsResponse.status,
            fetchSettingsResponse.statusText
          );
          setStatusMessage(
            `設定の取得に失敗しました。 HTTPステータス: ${fetchSettingsResponse.status} ${fetchSettingsResponse.statusText}`
          );
        }
      } else {
        console.error('Failed to delete settings:', response.status, response.statusText);
        setStatusMessage(
          `設定の削除に失敗しました。 HTTPステータス: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error('Error deleting settings:', error);
      setStatusMessage('設定の削除中にエラーが発生しました。');
    }
  };

  // 編集モードは現在未使用（必要に応じて追加）
  const UserFriendlyView = ({ setting }) => {
    const userDescription = setting.details.describe || '(説明文なし)';
    return (
      <div style={{ textAlign: 'left' }}>
        <p>{userDescription}</p>
      </div>
    );
  };

  // 新規アラートモーダルを開く関数
  const openNewAlertModal = (type) => {
    setInitialNotifyType(type);
    setShowNewAlertModal(true);
    setModalTab('table'); // デフォルトは「時刻表から設定」
  };

  return (
    <ThemeProvider theme={theme}>
      <div style={{ backgroundColor: '#F5F5F5', minHeight: '100vh', padding: '20px' }}>
        <Paper sx={{ p: 3, mb: 3, backgroundColor: '#FFFFFF', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)' }}>
          <h1>PoiCle</h1>
          <Button variant="contained" onClick={() => openNewAlertModal('arrive')} sx={{ mr: 1, mb: 1, mt: 1, ml: 1 }}>
            駅・バス停に着いた時にお知らせ
          </Button>
          <Button variant="contained" onClick={() => openNewAlertModal('sea')} sx={{ mr: 1, mb: 1, mt: 1, ml: 1 }}>
            海が見えるタイミングでお知らせ
          </Button>
          <Button variant="outlined" onClick={() => setShowJsonEditorModal(true)} sx={{ mr: 1, mb: 1, mt: 1, ml: 1 }}>
            JSONで編集（開発者向け）
          </Button>
          <br/>
          <Button onClick={() => setShowMapModal(true)}>海が見える所マップを見る</Button>
          <br/>
          <Button href={window.location.href + '&lp=true'}>ホームへ戻る</Button>

          <h2>既存の設定</h2>
          {settingsList.length > 0 ? (
            <div className="settings-container">
              {settingsList.map((setting) => {
                const currentTab = viewModeMap[setting.id] ?? 0;
                return (
                  <div key={setting.id} className="setting-card">
                    <Tabs
                      value={currentTab}
                      onChange={(event, newValue) => handleCardTabChange(setting.id, newValue)}
                      sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
                    >
                      <Tab label="表示" />
                      <Tab label="JSON" />
                    </Tabs>
                    <TabPanel value={currentTab} index={1}>
                      <pre style={{ textAlign: 'left', overflow: 'auto', maxHeight: '200px', backgroundColor: 'white', color: 'black' }}>
                        {JSON.stringify(setting, null, 2)}
                      </pre>
                    </TabPanel>
                    <TabPanel value={currentTab} index={0}>
                      <UserFriendlyView setting={setting} />
                    </TabPanel>
                    <div style={{ marginTop: '1rem' }}>
                      <button onClick={() => handleDelete(setting.id)}>削除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>設定がありません。</p>
          )}
        </Paper>

        {/* 編集モード（必要に応じて実装） */}
        {editingSetting && (
          <div style={{ marginTop: '2rem', border: '1px solid #ccc', padding: '1rem', backgroundColor: '#fff' }}>
            <h2>設定を編集</h2>
            <p>ID: {editingSetting.id}</p>
            <AdvancedAlertEditor
              initialSetting={editingSetting}
              onCancel={() => setEditingSetting(null)}
              onSave={(newSetting) => {
                const updated = { ...editingSetting, ...newSetting };
                // PUT更新処理を実装
              }}
            />
          </div>
        )}

        {/* 新規アラート用モーダル */}
        <Dialog open={showNewAlertModal} onClose={() => setShowNewAlertModal(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            新規アラートの追加
            <IconButton onClick={() => setShowNewAlertModal(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
              ×
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Paper sx={{ width: '100%', mt: 2 }}>
              <Tabs
                value={modalTab === 'table' ? 0 : 1}
                onChange={(_, newValue) => setModalTab(newValue === 0 ? 'table' : 'geo')}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab label="乗車駅・下車駅から選択" />
                <Tab label="時刻表から設定" />
              </Tabs>
            </Paper>

            <TabPanel value={modalTab === 'table' ? 0 : 1} index={1}>
              <AdvancedAlertEditor
                initialSetting={{ notifyType: initialNotifyType }} // 初期通知タイプを渡す
                updateFilters={() => {}}
                onCancel={() => setShowNewAlertModal(false)}
                onSave={() => {
                  setShowNewAlertModal(false);
                  // 保存後に再取得
                  (async () => {
                    try {
                      const res = await fetch(
                        `${MAIN_API_ENDPOINT}/settings?email=${email}`
                      );
                      if (res.ok) {
                        const data = await res.json();
                        setSettingsList(data.settings || []);
                      }
                    } catch {}
                  })();
                }}
              />
            </TabPanel>
            <TabPanel value={modalTab === 'table' ? 0 : 1} index={0}>
              <BoardingAlightingAlertEditor
                initialSetting={{ notifyType: initialNotifyType }}
                updateFilters={() => {}}
                onCancel={() => setShowNewAlertModal(false)}
                onSave={() => {
                  setShowNewAlertModal(false);
                  (async () => {
                    try {
                      const res = await fetch(
                        `${MAIN_API_ENDPOINT}/settings?email=${email}`
                      );
                      if (res.ok) {
                        const data = await res.json();
                        setSettingsList(data.settings || []);
                      }
                    } catch {}
                  })();
                }}
              />
            </TabPanel>
          </DialogContent>
        </Dialog>


        {/* JSON編集用モーダル */}
        <Dialog
          open={showJsonEditorModal}
          onClose={() => setShowJsonEditorModal(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            JSONで設定（開発者向け）
            <IconButton
              onClick={() => setShowJsonEditorModal(false)}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              ×
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <p>以下のテンプレートを編集し、GTFS-RTの設定を保存してください:</p>
            <AceEditor
              mode="json"
              theme="github"
              onChange={setJsonData}
              value={jsonData}
              width="100%"
              height="400px"
              fontSize={14}
              showPrintMargin
              showGutter
              highlightActiveLine
              setOptions={{
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: false,
                enableSnippets: false,
                showLineNumbers: true,
                tabSize: 2
              }}
            />
            <p>
              首都圏のJR東日本・横浜市営バス・やんばる急行バスに対応しています。
              <br />・JR東日本の場合はgtfs_rt_endpointを odpt_jreast
              <br />・横浜市営バスの場合はgtfs_rt_endpointを data
              <br />・やんばる急行バスの場合はgtfs_rt_endpointを yanbaru-expressbus
              <br />と設定してください。
            </p>
            <p>
              ※本システムでは１分毎に各列車・バスの位置情報を確認しています。各駅・バス停の停車時間が１分に満たない場合などトリガーされない場合がありますがご了承ください。
            </p>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center' }}>
            <Button onClick={() => setShowJsonEditorModal(false)}>キャンセル</Button>
            <Button
              onClick={() => {
                handleSubmit();
                setShowJsonEditorModal(false);
              }}
              variant="contained"
              color="primary"
            >
              保存
            </Button>
          </DialogActions>
        </Dialog>

        {/* マップ表示用モーダル */}
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
    </ThemeProvider>
  );
};

export default Settings;
