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
const BUTTER_API_BASE_URL = import.meta.env.VITE_BUTTER_API_BASE_URL;
const MAIN_API_ENDPOINT = import.meta.env.VITE_MAIN_API_ENDPOINT;

const AdvancedAlertEditor = ({
  initialSetting = {},
  updateFilters,
  onCancel,
  onSave
}) => {
  const [stations, setStations] = useState([]);
  // 駅情報をJSON文字列として保持
  const [selectedStation, setSelectedStation] = useState(
    initialSetting.filters?.stop_id_json || ''
  );
  const [timetable, setTimetable] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(
    initialSetting.filters?.trip_id || ''
  );
  const [stationSearch, setStationSearch] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [stationWarning, setStationWarning] = useState(false);

  // 通知タイプ（駅に着いたら、海が見えたら、など）
  const [notifyType, setNotifyType] = useState(initialSetting.notifyType || ''); // 初期値を initialSetting から取得
  // 到着駅の候補一覧
  const [arrivalStations, setArrivalStations] = useState([]);
  // 選択された到着駅
  const [selectedArrivalStation, setSelectedArrivalStation] = useState('');
  // 「何駅前」でお知らせするか
  const [notifyBeforeStation, setNotifyBeforeStation] = useState('0'); // 0=ちょうど到着駅

  // 通知方法（app / webhook）
  const [notificationMethod, setNotificationMethod] = useState('');
  // WebHook URL
  const [webhookUrl, setWebhookUrl] = useState('');

  // 成功ダイアログを開くかどうか
  const [open, setOpen] = useState(false);

  // ========== 自動生成される説明文 ========== //
  const [autoDescription, setAutoDescription] = useState('');

    // 初期設定 (props が変更されたときにもリセット)
    useEffect(() => {
      setSelectedStation(initialSetting.filters?.stop_id_json || '');
      setSelectedTrip(initialSetting.filters?.trip_id || '');
      setNotifyType(initialSetting.notifyType || '');
      setSelectedArrivalStation('');
      setNotifyBeforeStation('0');
      setNotificationMethod('');
      setWebhookUrl('');
      setAutoDescription('');

    }, [initialSetting]);

  // 駅検索
  useEffect(() => {
    if (!stationSearch) {
      setStations([]);
      return;
    }
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      handleStationSearch();
    }, 300);
    setSearchTimeout(timeout);
  }, [stationSearch]);

  const handleStationSearch = async () => {
    try {
      const response = await fetch(
        `${BUTTER_API_BASE_URL}/getStopsBySubstring?substring=${stationSearch}`
      );
      const data = await response.json();
      // odpt_jreast は先に表示
      data.sort((a, b) => {
        if(a.gtfs_id===b.gtfs_id){
          // 文字数が小さい順に並べ替え
          if(a.stop_name.split('-')[0].length<b.stop_name.split('-')[0].length) return -1;
          if(a.stop_name.split('-')[0].length>b.stop_name.split('-')[0].length) return 1;
          return 0;
        }
        if (a.gtfs_id === 'odpt_jreast') return -1;
        if (b.gtfs_id === 'odpt_jreast') return 1;
        return 0;
      });
      setStations(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectStation = async (stationJson) => {
    try {
      const stop = JSON.parse(stationJson);
      setSelectedStation(stationJson);
      const url = `${BUTTER_API_BASE_URL}/fetchTimeTableV1?gtfs_id=${stop.gtfs_id}&options={"stop_ids":["${stop.stop_id}"],"date":"${currentDate}"}`;
      const response = await fetch(url);
      let data = await response.json();

      if(data.stop_times.length>0){
        if(stop.gtfs_id==='odpt_jreast'){
          data.stop_times = data.stop_times.map((trip) => {
            if(trip.trip_headsign===''){
              // trip_idの最後から２文字目を取得
              const lastTwoChars = ('AAA'+trip.trip_id).slice(-2)[0];
              // 最後の１文字
              const lastChar = ('AAA'+trip.trip_id).slice(-1)[0];
              if(lastChar==='G'){
                const innner_loop_list = ['0','2','4','6','8'];
                const outer_loop_list = ['1','3','5','7','9'];
                if(innner_loop_list.includes(lastTwoChars)){
                  trip.trip_headsign = '内回り';
                }else if(outer_loop_list.includes(lastTwoChars)){
                  trip.trip_headsign = '外回り';
                }
              }
            }
            return trip;
          });
        }
      }
      setTimetable(data.stop_times);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectTrip = async (tripId) => {
    setSelectedTrip(tripId);
    if (updateFilters) {
      updateFilters({ trip_id: tripId });
    }
    // 「駅に着いた時」なら到着駅候補を取ってくる
    if (notifyType === 'arrive' && tripId) {
      try {
        const selectedStationObj = JSON.parse(selectedStation);
        const url = `${BUTTER_API_BASE_URL}/fetchTimeTableV1?gtfs_id=${selectedStationObj.gtfs_id}&options={"trip_ids":["${tripId}"],"date":"${currentDate}"}`;
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
        const selectedStationObj = JSON.parse(selectedStation);
        const url = `${BUTTER_API_BASE_URL}/fetchTimeTableV1?gtfs_id=${selectedStationObj.gtfs_id}&options={"trip_ids":["${selectedTrip}"],"date":"${currentDate}"}`;
        const res = await fetch(url);
        const data = await res.json();
        setArrivalStations(data.stop_times || []);
      } catch (e) {
        console.error('Error fetching arrival stations:', e);
      }
    }
  };

  // ★ 選択内容から、自動的に説明文を作る
  const generateDescription = () => {
    // 出発駅を取得
    let departureStation = '(出発駅未選択)';
    try {
      const st = JSON.parse(selectedStation);
      departureStation = st.stop_name ?? '(駅未選択)';
    } catch {}

    // 選択された列車・バス（trip_id）に該当する時刻表情報を探す
    const foundTrip = timetable.find((trip) => trip.trip_id === selectedTrip);
    // 発車時刻と headsign
    const departureTime = foundTrip?.departure_time ?? 'HH:MM';
    let headsign = foundTrip?.trip_headsign ?? '(行き先不明)';

    if(headsign===''){
      const lastTwoChars = ('AA'+selectedTrip).slice(-2)[0];
      const innner_loop_list = ['0','2','4','6','8'];
      const outer_loop_list = ['1','3','5','7','9'];
      if(innner_loop_list.includes(lastTwoChars)){
        headsign = '内回り';
      }else if(outer_loop_list.includes(lastTwoChars)){
        headsign = '外回り';
      }
    }

    // 到着駅を取得
    let arrivalName = '(到着駅未選択)';
    const foundArrival = arrivalStations.find(
      (s) => s.stop_id === selectedArrivalStation
    );
    if (foundArrival?.stop_name) {
      arrivalName = foundArrival.stop_name;
    }

    // 何駅前か
    const beforeStr = notifyBeforeStation === '0' ? '' : `${notifyBeforeStation}駅前`;

    // 通知タイプごとの文言
    if (notifyType === 'arrive') {
      if (selectedTrip && selectedArrivalStation) {
        if (notifyBeforeStation === '0') {
          return `「${departureStation}」を${departureTime}に発車する「${headsign}」行きが「${arrivalName}」に到着したとき通知。`;
        } else {
          return `「${departureStation}」を${departureTime}に発車する「${headsign}」行きが「${arrivalName}」の${beforeStr}に到達したとき通知。`;
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
  }, [
    notifyType,
    selectedTrip,
    selectedArrivalStation,
    notifyBeforeStation,
    arrivalStations,
    selectedStation
  ]);

  // JWT または device_id からユーザを特定
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

  // 保存
  const handleSaveNotification = async () => {
    let selectedStationObj = null;
    try {
      selectedStationObj = JSON.parse(selectedStation);
    } catch (e) {
      // 未選択の場合は null
    }

    const email = getUserIdentifier();
    const urlParams = new URLSearchParams(window.location.search);
    const fcmParam = urlParams.get('fcm');
    const emailAdress = email.split('@')[1] === 'fcm' ? null : email;

    const param_str = emailAdress ? `?email=${emailAdress}` : `?fcm=${fcmParam}`;
    const poicleWebhookUrl = `${MAIN_API_ENDPOINT}/notify${param_str}`;

    const filters = {};

    if (notifyType === 'arrive') {
      // selectedArrivalStation のインデックス
      const arrivalIndex = arrivalStations.findIndex(
        (s) => s.stop_id === selectedArrivalStation
      );
      let targetIndex = arrivalIndex; // 0駅前

      const offset = parseInt(notifyBeforeStation, 10);
      if (!isNaN(offset) && arrivalIndex - offset >= 0) {
        targetIndex = arrivalIndex - offset;
      }

      // トリガーとなる駅(stop_id)
      const targetStopId = arrivalStations[targetIndex]?.stop_id || selectedArrivalStation;

      filters.trip_id = selectedTrip;
      filters.stop_id = targetStopId;
    }

    // 海が見えるタイミング
    if (notifyType === 'sea' && selectedStationObj?.gtfs_id && selectedTrip) {
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
        },
        {
          "type": "Point",
          "coordinates": [
            139.9208975,
            35.35922
          ],
          "properties": {
            "radius": 12.374332621667897
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.92580125,
            35.378695
          ],
          "properties": {
            "radius": 18.385452031843638
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.63342213487655,
            35.44978126340388
          ],
          "properties": {
            "radius": 33.36438372196504
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.6390459628717,
            35.45201426413768
          ],
          "properties": {
            "radius": 44.22347606925745
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.64210900416668,
            35.4558435484375
          ],
          "properties": {
            "radius": 66.41976127358458
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.64220407863104,
            35.45096646634334
          ],
          "properties": {
            "radius": 52.50933563433672
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.65101878333334,
            35.441992883333334
          ],
          "properties": {
            "radius": 60.32350763160643
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.65230641666668,
            35.44271441666667
          ],
          "properties": {
            "radius": 11.999982853972735
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.647189,
            35.450792
          ],
          "properties": {
            "radius": 0.0
          }
        },
        {
          "type": "Point",
          "coordinates": [
            139.6388370411817,
            35.45502856899471
          ],
          "properties": {
            "radius": 53.4160588128596
          }
        }
      ];
    }

    const notificationData = {
      gtfs_rt_endpoint: selectedStationObj?.gtfs_id || '',
      user_email: email,
      gtfs_endpoint: '',
      filters,
      webhook_url:
        notificationMethod === 'webhook'
          ? webhookUrl
          : poicleWebhookUrl,
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
        setOpen(true);
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

  // 「何駅前」プルダウンを動的に生成する関数
  const renderNotifyBeforeOptions = () => {
    // 選択された到着駅のインデックスを特定
    const arrivalIndex = arrivalStations.findIndex(
      (s) => s.stop_id === selectedArrivalStation
    );
    // 存在しない場合は「ちょうど到着駅」だけ
    if (arrivalIndex < 0) {
      return (
        <>
          <MenuItem value="0">ちょうど到着駅</MenuItem>
        </>
      );
    }

    // 到着駅のインデックス数まで「何駅前」を生成可能
    // ただし上限を 4 駅前などにしたければ、 `min(arrivalIndex, 4)` にするなど調整可能
    const maxBefore = Math.min(arrivalIndex, 4);

    const options = [];
    // ちょうど到着駅(0駅前)
    options.push(
      <MenuItem value="0" key="0">ちょうど到着</MenuItem>
    );
    // 1～maxBefore駅前
    for (let i = 1; i <= maxBefore; i++) {
      options.push(
        <MenuItem value={`${i}`} key={i}>{`${i}つ前`}</MenuItem>
      );
    }
    return options;
  };

  return (
    <Paper sx={{ p: 3, backgroundColor: '#FFFFFF' }}>
      {/* 自動生成される通知条件の説明 */}
      <Box sx={{ mb: 2, backgroundColor: '#f8f8f8', p: 1 }}>
        <strong>現在の通知条件説明：</strong> {autoDescription}
      </Box>

      {/* 駅検索 */}
      <Autocomplete
        freeSolo
        options={stations}
        getOptionLabel={(option) => option.stop_name || ''}
        onInputChange={(e, value) => setStationSearch(value)}
        isOptionEqualToValue={(option, value) => option.stop_id === value.stop_id}
        renderInput={(params) => (
          <TextField {...params} label="駅・バス停を検索" size="small" />
        )}
        onChange={(e, value) => {
          if (value) {
            setStationWarning(false);
            handleSelectStation(JSON.stringify(value));
          }
        }}
        renderOption={(props, option) => (
          <li {...props} key={`${option.stop_id}-${option.gtfs_id}`}>
            {option.stop_name}
          </li>
        )}
        sx={{ mb: 2 }}
      />
      {stationWarning && (
        <div style={{ color: 'red' }}>
          駅・バス停を表示された候補から選択してください
        </div>
      )}

      {/* 列車・バス選択 */}
      <FormControl fullWidth>
        <InputLabel>列車・バスを選択</InputLabel>
        <Select
          value={selectedTrip}
          onChange={(e) => handleSelectTrip(e.target.value)}
          label="列車・バスを選択"
        >
          <MenuItem value="">
            <em>選択してください</em>
          </MenuItem>
          {timetable
            .filter((trip) => trip.departure_time !== "")
            .map((trip) => (
              <MenuItem key={trip.trip_id} value={trip.trip_id}>
                {trip.departure_time} - {trip.trip_headsign || '(行き先不明)'} - {trip.trip_id}
              </MenuItem>
          ))}
        </Select>
        <p>列車・バスは本日の定時到着時刻・定時出発時刻を表示しています</p>
      </FormControl>

      {/* 通知種類 */}
      <FormControl sx={{ display: 'flex', flexDirection: 'row', gap: 2, mt: 2 }}>
        <Button
          variant={notifyType === 'arrive' ? 'contained' : 'outlined'}
          onClick={() => handleNotifyTypeChange('arrive')}
        >
          駅に着いた時にお知らせ
        </Button>
        <Button
          variant={notifyType === 'sea' ? 'contained' : 'outlined'}
          onClick={() => handleNotifyTypeChange('sea')}
        >
          海が見えるタイミングでお知らせ
        </Button>
      </FormControl>

      <p>「海が見えるタイミングでお知らせ」はPLATEAUや標高データを基に計算した海が見える箇所で通知します。</p>

      {/* 到着時の設定 */}
      {notifyType === 'arrive' && arrivalStations.length > 0 && (
        <>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>到着を通知する駅</InputLabel>
            <Select
              value={selectedArrivalStation}
              onChange={(e) => {
                setSelectedArrivalStation(e.target.value);
                // 到着駅が変わったら「何駅前」はデフォルトの 0 に
                setNotifyBeforeStation('0');
              }}
              label="到着を通知する駅"
            >
              <MenuItem value="">
                <em>選択してください</em>
              </MenuItem>
              {arrivalStations.map((stop) => (
                <MenuItem key={stop.stop_id} value={stop.stop_id}>
                  {stop.arrival_time} - {stop.stop_name || stop.stop_id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 「何駅前」選択 */}
          {selectedArrivalStation && (
            <>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>〇駅前でお知らせ</InputLabel>
                <Select
                  value={notifyBeforeStation}
                  onChange={(e) => setNotifyBeforeStation(e.target.value)}
                  label="〇駅前でお知らせ"
                >
                  {renderNotifyBeforeOptions()}
                </Select>
                <p>通知までタイムラグが生じる場合があるので余裕を持って数駅前に設定してください</p>
              </FormControl>

              {/* 通知方法 */}
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button
                  variant={notificationMethod === 'app' ? 'contained' : 'outlined'}
                  onClick={() => setNotificationMethod('app')}
                >
                  PoiCle アプリ・メールでお知らせ
                </Button>
                <Button
                  variant={notificationMethod === 'webhook' ? 'contained' : 'outlined'}
                  onClick={() => setNotificationMethod('webhook')}
                >
                  任意のWeb Hook URL を設定
                </Button>
              </Box>
            </>
          )}

          {/* 保存ボタン */}
          {(notificationMethod === 'app' || notificationMethod === 'webhook') && selectedArrivalStation && (
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
                <Button
                  sx={{ mt: 2, ml: 2 }}
                  variant="outlined"
                  onClick={onCancel}
                >
                  キャンセル
                </Button>
              )}
            </Box>
          )}
        </>
      )}

      {/* 海が見えるタイミング */}
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
              PoiCle アプリ・メールでお知らせ
            </Button>
            <Button
              variant={notificationMethod === 'webhook' ? 'contained' : 'outlined'}
              onClick={() => setNotificationMethod('webhook')}
            >
              任意のWeb Hook URL を設定
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
                <Button
                  sx={{ mt: 2, ml: 2 }}
                  variant="outlined"
                  onClick={onCancel}
                >
                  キャンセル
                </Button>
              )}
            </Box>
          )}
        </>
      )}

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>通知設定</DialogTitle>
        <DialogContent>
          <Box>通知設定が保存されました。</Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>閉じる</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default AdvancedAlertEditor;
