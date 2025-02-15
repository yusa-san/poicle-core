// client/src/components/BoardingAlightingAlertEditor.jsx
import React, { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Paper,
  Autocomplete,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle
} from '@mui/material';

const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '');

const MAIN_API_ENDPOINT = import.meta.env.VITE_MAIN_API_ENDPOINT;
const BUTTER_API_BASE_URL = import.meta.env.VITE_BUTTER_API_BASE_URL;

const BoardingAlightingAlertEditor = ({
  initialSetting = {},
  updateFilters,
  onCancel,
  onSave
}) => {
  // 乗車駅用
  const [boardingStations, setBoardingStations] = useState([]);
  const [boardingSearch, setBoardingSearch] = useState('');
  const [selectedBoarding, setSelectedBoarding] = useState(initialSetting.boardingStation || '');
  const [boardingTimetable, setBoardingTimetable] = useState([]);

  // 降車駅用
  const [alightingStations, setAlightingStations] = useState([]);
  const [alightingSearch, setAlightingSearch] = useState('');
  const [selectedAlighting, setSelectedAlighting] = useState(initialSetting.alightingStation || '');
  const [alightingTimetable, setAlightingTimetable] = useState([]);

  // 共通の乗降両駅に停車する列車・バス一覧（降車駅の到着時刻も保持）
  const [commonTrips, setCommonTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(initialSetting.trip_id || '');

  // 降車駅での詳細時刻表（「何駅前」選択用）
  const [arrivalStations, setArrivalStations] = useState([]);

  // 通知設定その他
  const [notifyType, setNotifyType] = useState(initialSetting.notifyType || '');
  const [notifyBeforeStation, setNotifyBeforeStation] = useState('0');
  const [notificationMethod, setNotificationMethod] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoDescription, setAutoDescription] = useState('');

  // 乗車駅検索のディバウンス
  useEffect(() => {
    if (!boardingSearch) {
      setBoardingStations([]);
      return;
    }
    const timeout = setTimeout(() => {
      handleBoardingStationSearch();
    }, 300);
    return () => clearTimeout(timeout);
  }, [boardingSearch]);

  // 降車駅検索のディバウンス
  useEffect(() => {
    if (!alightingSearch) {
      setAlightingStations([]);
      return;
    }
    const timeout = setTimeout(() => {
      handleAlightingStationSearch();
    }, 300);
    return () => clearTimeout(timeout);
  }, [alightingSearch]);

  const handleBoardingStationSearch = async () => {
    try {
      const response = await fetch(
        `${BUTTER_API_BASE_URL}/getStopsBySubstring?substring=${boardingSearch}`
      );
      const data = await response.json();
      data.sort((a, b) => {
        if (a.gtfs_id === b.gtfs_id) {
          return a.stop_name.split('-')[0].length - b.stop_name.split('-')[0].length;
        }
        if (a.gtfs_id === 'odpt_jreast') return -1;
        if (b.gtfs_id === 'odpt_jreast') return 1;
        return 0;
      });
      setBoardingStations(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAlightingStationSearch = async () => {
    try {
      const response = await fetch(
        `${BUTTER_API_BASE_URL}/getStopsBySubstring?substring=${alightingSearch}`
      );
      const data = await response.json();
      data.sort((a, b) => {
        if (a.gtfs_id === b.gtfs_id) {
          return a.stop_name.split('-')[0].length - b.stop_name.split('-')[0].length;
        }
        if (a.gtfs_id === 'odpt_jreast') return -1;
        if (b.gtfs_id === 'odpt_jreast') return 1;
        return 0;
      });
      setAlightingStations(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectBoarding = async (stationJson) => {
    try {
      const station = JSON.parse(stationJson);
      setSelectedBoarding(stationJson);
      const url = `${BUTTER_API_BASE_URL}/fetchTimeTableV1?gtfs_id=${station.gtfs_id}&options={"stop_ids":["${station.stop_id}"],"date":"${currentDate}"}`;
      const response = await fetch(url);
      const data = await response.json();
      setBoardingTimetable(data.stop_times || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectAlighting = async (stationJson) => {
    try {
      const station = JSON.parse(stationJson);
      setSelectedAlighting(stationJson);
      const url = `${BUTTER_API_BASE_URL}/fetchTimeTableV1?gtfs_id=${station.gtfs_id}&options={"stop_ids":["${station.stop_id}"],"date":"${currentDate}"}`;
      const response = await fetch(url);
      const data = await response.json();
      setAlightingTimetable(data.stop_times || []);
    } catch (e) {
      console.error(e);
    }
  };

  // 両駅の時刻表が取得できたら、共通の列車・バス（かつ乗車駅で先に停車するもの）を算出
  useEffect(() => {
    if (boardingTimetable.length > 0 && alightingTimetable.length > 0) {
      const alightingMap = {};
      alightingTimetable.forEach(item => {
        if (!alightingMap[item.trip_id]) {
          alightingMap[item.trip_id] = item;
        }
      });
      const common = boardingTimetable.reduce((acc, item) => {
        const aItem = alightingMap[item.trip_id];
        if (aItem) {
          const [depH, depM] = item.departure_time.split(':').map(Number);
          const [arrH, arrM] = aItem.arrival_time.split(':').map(Number);
          const depMinutes = depH * 60 + depM;
          const arrMinutes = arrH * 60 + arrM;
          if (depMinutes < arrMinutes) {
            // 降車駅の時刻表から到着時刻も付与
            acc.push({ ...item, arrival_time: aItem.arrival_time });
          }
        }
        return acc;
      }, []);
      setCommonTrips(common);
    }
  }, [boardingTimetable, alightingTimetable]);

  // 選択された列車・バスを設定し、降車駅の詳細時刻表を取得
  const handleSelectTrip = async (tripId) => {
    setSelectedTrip(tripId);
    if (notifyType === 'arrive' && tripId && selectedAlighting) {
      try {
        const alightingStationObj = JSON.parse(selectedAlighting);
        const url = `${BUTTER_API_BASE_URL}/fetchTimeTableV1?gtfs_id=${alightingStationObj.gtfs_id}&options={"trip_ids":["${tripId}"],"date":"${currentDate}"}`;
        const res = await fetch(url);
        const data = await res.json();
        setArrivalStations(data.stop_times || []);
      } catch (e) {
        console.error('Error fetching arrival stations:', e);
      }
    }
  };

  const handleNotifyTypeChange = async (type) => {
    setNotifyType(type);
    if (type === 'arrive' && selectedTrip) {
      try {
        const alightingStationObj = JSON.parse(selectedAlighting);
        const url = `${BUTTER_API_BASE_URL}/fetchTimeTableV1?gtfs_id=${alightingStationObj.gtfs_id}&options={"trip_ids":["${selectedTrip}"],"date":"${currentDate}"}`;
        const res = await fetch(url);
        const data = await res.json();
        setArrivalStations(data.stop_times || []);
      } catch (e) {
        console.error('Error fetching arrival stations:', e);
      }
    }
  };

  // 自動生成される説明文の生成
  const generateDescription = () => {
    let boardingName = '(乗車駅未選択)';
    try {
      const st = JSON.parse(selectedBoarding);
      boardingName = st.stop_name || '(乗車駅未選択)';
    } catch {}
    let alightingName = '(降車駅未選択)';
    try {
      const st = JSON.parse(selectedAlighting);
      alightingName = st.stop_name || '(降車駅未選択)';
    } catch {}
    const foundTrip = boardingTimetable.find(trip => trip.trip_id === selectedTrip);
    const departureTime = foundTrip ? foundTrip.departure_time : 'HH:MM';
    const headsign = foundTrip ? (foundTrip.trip_headsign || '(行き先不明)') : '(行き先不明)';
    if (notifyType === 'arrive') {
      if (selectedTrip && alightingName) {
        if (notifyBeforeStation === '0') {
          return `「${boardingName}」発 ${departureTime} の「${headsign}」が「${alightingName}」に到着したとき通知。`;
        } else {
          return `「${boardingName}」発 ${departureTime} の「${headsign}」が「${alightingName}」の ${notifyBeforeStation} 駅前で通知。`;
        }
      } else {
        return `通知条件がまだ設定されていません`;
      }
    } else if (notifyType === 'sea') {
      return `「${selectedTrip}」から海が見えるタイミングで通知`;
    } else {
      return '通知条件がまだ設定されていません';
    }
  };

  useEffect(() => {
    const desc = generateDescription();
    setAutoDescription(desc);
  }, [notifyType, selectedTrip, notifyBeforeStation, selectedBoarding, selectedAlighting, boardingTimetable]);

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
          return decoded.email + '@' + Math.random();
        }
      } catch (e) {
        console.error('Invalid JWT token:', e);
      }
    }
    if (deviceId) {
      return `${deviceId}@fcm@${Math.random()}`;
    }
    return 'user@example.com';
  };

  const handleSaveNotification = async () => {
    let boardingStationObj = null;
    try {
      boardingStationObj = JSON.parse(selectedBoarding);
    } catch (e) {
      // 未選択の場合は null
    }
    const email = getUserIdentifier();
    const urlParams = new URLSearchParams(window.location.search);
    const fcmParam = urlParams.get('fcm');
    const emailAddress = email.split('@')[1] === 'fcm' ? null : email;
    const param_str = emailAddress ? `?email=${emailAddress}` : `?fcm=${fcmParam}`;
    const poicleWebhookUrl = `${MAIN_API_ENDPOINT}/notify${param_str}`;

    const filters = {};

    if (notifyType === 'arrive') {
      const arrivalIndex = arrivalStations.findIndex(
        (s) => s.stop_id === JSON.parse(selectedAlighting).stop_id
      );
      let targetIndex = arrivalIndex;
      const offset = parseInt(notifyBeforeStation, 10);
      if (!isNaN(offset) && arrivalIndex - offset >= 0) {
        targetIndex = arrivalIndex - offset;
      }
      const targetStopId =
        (arrivalStations[targetIndex] && arrivalStations[targetIndex].stop_id) ||
        JSON.parse(selectedAlighting).stop_id;
      filters.trip_id = selectedTrip;
      filters.stop_id = targetStopId;
    }

    if (notifyType === 'sea' && boardingStationObj && selectedTrip) {
      filters.target_area = [
        {
          "type": "Point",
          "coordinates": [
            127.67444444442167,
            26.208277778027607
          ],
          "properties": {
            "radius": 25.238561252074714
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.84390035667785,
            26.445889780976128
          ],
          "properties": {
            "radius": 938.5796208259148
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.87602991441415,
            26.45948491717772
          ],
          "properties": {
            "radius": 2276.186649395879
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.97408615075531,
            26.558416456021668
          ],
          "properties": {
            "radius": 2501.2139362780295
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.97949999983649,
            26.589679487253424
          ],
          "properties": {
            "radius": 7.575869988162749
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.89920422942929,
            26.62469035138379
          ],
          "properties": {
            "radius": 5411.356689537073
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.88062245963401,
            26.691727500686675
          ],
          "properties": {
            "radius": 1562.5065191385904
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.90627777764804,
            26.697277777802096
          ],
          "properties": {
            "radius": 1.4576696599747533e-09
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.91872633731309,
            26.70049588479649
          ],
          "properties": {
            "radius": 355.398531800082
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.92805555541578,
            26.691944444471222
          ],
          "properties": {
            "radius": 1.414319944832763e-09
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.99219926796106,
            26.690909846999972
          ],
          "properties": {
            "radius": 824.1023591254784
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.99664074056933,
            26.677537037070458
          ],
          "properties": {
            "radius": 87.46307701644633
          }
        },
        {
          "type": "Point",
          "coordinates": [
            127.654405555542,
            26.17452222248762
          ],
          "properties": {
            "radius": 200.08673980321703
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.84567200000004,
            35.03610875
          ],
          "properties": {
            "radius": 22.37756430875767
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.85413998242188,
            35.21322800065104
          ],
          "properties": {
            "radius": 1321.5497989851774
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.9450937037037,
            35.42733662037037
          ],
          "properties": {
            "radius": 117.7307219841265
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.82406603854875,
            35.16577847871
          ],
          "properties": {
            "radius": 1841.6298314190858
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.85742249999998,
            35.2848015
          ],
          "properties": {
            "radius": 41.075964146876
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.90263,
            34.99829
          ],
          "properties": {
            "radius": 0.0
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.87130152752007,
            35.23157903421975
          ],
          "properties": {
            "radius": 291.1315261503239
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.9632492222222,
            34.983832222222226
          ],
          "properties": {
            "radius": 32.07512797293301
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.85326,
            35.30095
          ],
          "properties": {
            "radius": 0.0
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.84109697936208,
            35.07938775984991
          ],
          "properties": {
            "radius": 696.1663253659815
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.8377470642361,
            35.12775849565972
          ],
          "properties": {
            "radius": 1068.5395384430146
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.86497624999998,
            35.333663333333334
          ],
          "properties": {
            "radius": 54.25879664629432
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.8218377742947,
            35.19194222570533
          ],
          "properties": {
            "radius": 149.79709946445564
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.8621271031746,
            35.0111828968254
          ],
          "properties": {
            "radius": 43.36256650369273
          }
        },
        {
          "type": "Point",
          "coordinates": [
            140.0013569366744,
            35.0313941977467
          ],
          "properties": {
            "radius": 1059.502422993577
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.97521749999999,
            35.44012115384616
          ],
          "properties": {
            "radius": 15.246365865802472
          }
        },
        {
          "type": "Point",
          "coordinates": [
            140.08315832277947,
            35.0713569787772
          ],
          "properties": {
            "radius": 900.9431907049672
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.83414923076924,
            35.112098461538466
          ],
          "properties": {
            "radius": 9.145518922730794
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.8490889483173,
            35.097923806490385
          ],
          "properties": {
            "radius": 327.6795402760108
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.972306875,
            35.014791875
          ],
          "properties": {
            "radius": 53.05067289486038
          }
        }
      ];
    }

    const notificationData = {
      gtfs_rt_endpoint: boardingStationObj ? boardingStationObj.gtfs_id : '',
      user_email: email,
      gtfs_endpoint: '',
      webhook_url:
        notificationMethod === 'webhook'
          ? webhookUrl
          : poicleWebhookUrl,
      filters,
      details: {
        describe: autoDescription
      }
    };
    console.log('Save notification data:', notificationData);

    try {
      const response = await fetch(
        `${MAIN_API_ENDPOINT}/settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(notificationData)
        }
      );
      if (response.ok) {
        if (onSave) {
          onSave(notificationData);
        }
      } else {
        console.error('Failed to save settings:', response.status, response.statusText);
      }
    } catch (e) {
      console.error('Error in handleSaveNotification', e);
    }
  };

  const renderNotifyBeforeOptions = () => {
    const arrivalIndex = arrivalStations.findIndex(
      (s) => s.stop_id === JSON.parse(selectedAlighting).stop_id
    );
    if (arrivalIndex < 0) {
      return <MenuItem value="0">ちょうど到着</MenuItem>;
    }
    const maxBefore = Math.min(arrivalIndex, 4);
    const options = [];
    options.push(<MenuItem value="0" key="0">ちょうど到着</MenuItem>);
    for (let i = 1; i <= maxBefore; i++) {
      options.push(<MenuItem value={`${i}`} key={i}>{`${i}つ前`}</MenuItem>);
    }
    return options;
  };

  return (
    <Paper sx={{ p: 3, backgroundColor: '#FFFFFF' }}>
      {/* 自動生成される通知条件の説明 */}
      <Box sx={{ mb: 2, backgroundColor: '#f8f8f8', p: 1 }}>
        <strong>現在の通知条件説明：</strong> {autoDescription}
      </Box>

      {/* 乗車駅の選択 */}
      <div>
        <Autocomplete
          freeSolo
          options={boardingStations}
          getOptionLabel={(option) => option.stop_name || ''}
          onInputChange={(e, value) => setBoardingSearch(value)}
          isOptionEqualToValue={(option, value) => option.stop_id === value.stop_id}
          renderInput={(params) => (
            <TextField {...params} label="同じ路線の乗車駅・バス停を検索" size="small" />
          )}
          onChange={(e, value) => {
            if (value) {
              handleSelectBoarding(JSON.stringify(value));
            }
          }}
          renderOption={(props, option) => (
            <li {...props} key={`${option.stop_id}-${option.gtfs_id}`}>
              {option.stop_name}
            </li>
          )}
          sx={{ mb: 2 }}
        />
      </div>

      {/* 降車駅の選択 */}
      <div>
        <Autocomplete
          freeSolo
          options={alightingStations}
          getOptionLabel={(option) => option.stop_name || ''}
          onInputChange={(e, value) => setAlightingSearch(value)}
          isOptionEqualToValue={(option, value) => option.stop_id === value.stop_id}
          renderInput={(params) => (
            <TextField {...params} label="同じ路線の降車駅・バス停を検索" size="small" />
          )}
          onChange={(e, value) => {
            if (value) {
              handleSelectAlighting(JSON.stringify(value));
            }
          }}
          renderOption={(props, option) => (
            <li {...props} key={`${option.stop_id}-${option.gtfs_id}`}>
              {option.stop_name}
            </li>
          )}
          sx={{ mb: 2 }}
        />
      </div>

      {/* 共通の列車・バス選択（乗車・降車両方に停車するもの） */}
      {(boardingTimetable.length > 0 && alightingTimetable.length > 0) && (
        <FormControl fullWidth>
          <InputLabel>乗車・降車両方に停車する列車・バスを選択</InputLabel>
          <Select
            value={selectedTrip}
            onChange={(e) => handleSelectTrip(e.target.value)}
            label="乗車・降車両方に停車する列車・バスを選択"
          >
            <MenuItem value="">
              <em>選択してください</em>
            </MenuItem>
            {commonTrips.map((trip) => (
              <MenuItem key={trip.trip_id} value={trip.trip_id}>
                {/* ユーザーにも分かりやすいラベル表示 */}
                {trip.departure_time}発＞{trip.arrival_time}着
                「{trip.trip_headsign || '不明'}」（{trip.trip_id}）
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* 通知種類 */}
      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'row', gap: 2 }}>
        <Button
          variant={notifyType === 'arrive' ? 'contained' : 'outlined'}
          onClick={() => handleNotifyTypeChange('arrive')}
        >
          駅・バス停到着時に通知
        </Button>
        <Button
          variant={notifyType === 'sea' ? 'contained' : 'outlined'}
          onClick={() => handleNotifyTypeChange('sea')}
        >
          海が見えるタイミングで通知
        </Button>
      </Box>

      {/* 「駅・バス停到着時」の場合 */}
      {notifyType === 'arrive' && selectedTrip && (
        <>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>何駅前で通知</InputLabel>
            <Select
              value={notifyBeforeStation}
              onChange={(e) => setNotifyBeforeStation(e.target.value)}
              label="何駅前で通知"
            >
              {renderNotifyBeforeOptions()}
            </Select>
          </FormControl>
          <Box sx={{ mt: 2 }}>
            <Button
              variant={notificationMethod === 'app' ? 'contained' : 'outlined'}
              onClick={() => setNotificationMethod('app')}
            >
              PoiCleアプリ・メールで通知
            </Button>
            <Button
              variant={notificationMethod === 'webhook' ? 'contained' : 'outlined'}
              onClick={() => setNotificationMethod('webhook')}
              sx={{ ml: 2 }}
            >
              任意のWeb Hook URLを設定
            </Button>
          </Box>
          {(notificationMethod === 'app' || notificationMethod === 'webhook') && (
            <Box sx={{ mt: 2 }}>
              {notificationMethod === 'webhook' && (
                <TextField
                  fullWidth
                  label="WebHook URL"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  size="small"
                />
              )}
              <Button sx={{ mt: 2 }} variant="contained" onClick={handleSaveNotification}>
                保存
              </Button>
              {onCancel && (
                <Button sx={{ mt: 2, ml: 2 }} variant="outlined" onClick={onCancel}>
                  キャンセル
                </Button>
              )}
            </Box>
          )}
        </>
      )}

      {/* 「海が見えるタイミング」の場合 */}
      {notifyType === 'sea' && (
        <>
          <Box sx={{ mt: 2, color: 'blue' }}>
            現在、横浜市営バスあかいくつ線、やんばる急行バスに対応しています。
          </Box>
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant={notificationMethod === 'app' ? 'contained' : 'outlined'}
              onClick={() => setNotificationMethod('app')}
            >
              PoiCleアプリ・メールで通知
            </Button>
            <Button
              variant={notificationMethod === 'webhook' ? 'contained' : 'outlined'}
              onClick={() => setNotificationMethod('webhook')}
            >
              任意のWeb Hook URLを設定
            </Button>
          </Box>
          {(notificationMethod === 'app' || notificationMethod === 'webhook') && (
            <Box sx={{ mt: 2 }}>
              {notificationMethod === 'webhook' && (
                <TextField
                  fullWidth
                  label="WebHook URL"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  size="small"
                />
              )}
              <Button sx={{ mt: 2 }} variant="contained" onClick={handleSaveNotification}>
                保存
              </Button>
              {onCancel && (
                <Button sx={{ mt: 2, ml: 2 }} variant="outlined" onClick={onCancel}>
                  キャンセル
                </Button>
              )}
            </Box>
          )}
        </>
      )}
    </Paper>
  );
};

export default BoardingAlightingAlertEditor;
