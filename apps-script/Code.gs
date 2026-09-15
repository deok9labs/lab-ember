const MEMBERS_SHEET_NAME = 'members';
const AVAILABILITY_SHEET_NAME = 'availability';
const TIME_ZONE = 'Asia/Seoul';

/** 활성 팀원의 공개 가능한 정보만 반환한다. */
function doGet(event) {
  const action = event && event.parameter ? event.parameter.action : 'members';

  try {
    if (action === 'members') {
      return createJsonResponse({ ok: true, members: getActiveMembers() });
    }
    if (action === 'schedule') {
      return createJsonResponse({ ok: true, ...getCurrentSchedule() });
    }
    return createJsonResponse({ ok: false, error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    console.error('일정 API 요청 실패', error);
    return createJsonResponse({
      ok: false,
      error: '일정 데이터를 불러오지 못했습니다.',
    });
  }
}

/** 현재 주의 팀원 일정을 저장한다. */
function doPost(event) {
  try {
    const body = JSON.parse(event && event.postData ? event.postData.contents : '{}');
    if (body.action !== 'saveSchedule') {
      return createJsonResponse({ ok: false, error: '지원하지 않는 요청입니다.' });
    }

    const result = saveSchedule(body);
    return createJsonResponse({ ok: true, ...result });
  } catch (error) {
    console.error('일정 저장 실패', error);
    return createJsonResponse({
      ok: false,
      error: '일정을 저장하지 못했습니다.',
    });
  }
}

/** 현재 주와 그 주에 저장된 활성 팀원의 일정만 반환한다. */
function getCurrentSchedule() {
  const weekStart = getCurrentWeekStart();
  const weekEnd = addDays(weekStart, 6);
  const members = getActiveMembers();
  const activeMemberIds = new Set(members.map((member) => member.id));

  return {
    weekStart,
    weekEnd,
    members,
    availability: getAvailability(weekStart, activeMemberIds),
  };
}

/** members 시트에서 활성 팀원을 표시 순서대로 읽는다. */
function getActiveMembers() {
  const sheet = getSpreadsheet().getSheetByName(MEMBERS_SHEET_NAME);

  if (!sheet) throw new Error('members 시트를 찾을 수 없습니다.');

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) return [];

  const headers = values[0].map((value) => value.trim());
  const requiredHeaders = ['member_id', 'display_name', 'active', 'sort_order'];
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) throw new Error(`필수 열이 없습니다: ${header}`);
  });

  const column = Object.fromEntries(
    headers.map((header, index) => [header, index]),
  );
  const activeValues = new Set(['true', '1', 'yes', 'y']);

  return values
    .slice(1)
    .filter((row) => activeValues.has(
      String(row[column.active]).trim().toLowerCase(),
    ))
    .map((row) => ({
      id: String(row[column.member_id]).trim(),
      name: String(row[column.display_name]).trim(),
      status: column.status === undefined
        ? '미입력'
        : String(row[column.status]).trim() || '미입력',
      updatedAt: column.updated_at === undefined
        ? ''
        : String(row[column.updated_at]).trim(),
      sortOrder: Number(row[column.sort_order]) || 0,
    }))
    .filter((member) => member.id && member.name)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/** availability 시트에서 현재 주에 해당하는 행을 읽는다. */
function getAvailability(weekStart, activeMemberIds) {
  const sheet = getSpreadsheet().getSheetByName(AVAILABILITY_SHEET_NAME);
  if (!sheet) throw new Error('availability 시트를 찾을 수 없습니다.');

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = getAvailabilityHeaders(sheet);
  const requiredHeaders = [
    'week_start',
    'date',
    'member_id',
    'updated_at',
    'revision',
    ...getTimeHeaders(),
  ];
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) throw new Error(`필수 열이 없습니다: ${header}`);
  });

  const column = Object.fromEntries(
    headers.map((header, index) => [header, index]),
  );
  const timeHeaders = getTimeHeaders();

  return values
    .slice(1)
    .filter((row) => (
      normalizeDate(row[column.week_start]) === weekStart
      && activeMemberIds.has(String(row[column.member_id]).trim())
    ))
    .map((row) => ({
      memberId: String(row[column.member_id]).trim(),
      date: normalizeDate(row[column.date]),
      slots: timeHeaders.filter((time) => isAvailable(row[column[time]])),
      updatedAt: normalizeDateTime(row[column.updated_at]),
      revision: Number(row[column.revision]) || 0,
    }));
}

/** 팀원의 현재 주 일정을 날짜별 행으로 생성하거나 갱신한다. */
function saveSchedule(body) {
  const weekStart = getCurrentWeekStart();
  const memberId = String(body.memberId || '').trim();
  const requestedWeekStart = String(body.weekStart || '').trim();
  const requestedSlots = Array.isArray(body.slots) ? body.slots : [];

  if (!memberId) throw new Error('memberId가 필요합니다.');
  if (requestedWeekStart !== weekStart) throw new Error('현재 주 일정만 저장할 수 있습니다.');

  const activeMemberIds = new Set(getActiveMembers().map((member) => member.id));
  if (!activeMemberIds.has(memberId)) throw new Error('활성 팀원이 아닙니다.');

  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const allowedDates = new Set(weekDates);
  const allowedTimes = new Set(getTimeHeaders());
  const slotsByDate = new Map(weekDates.map((date) => [date, new Set()]));

  requestedSlots.forEach((slot) => {
    const date = String(slot && slot.date || '').trim();
    const time = String(slot && slot.time || '').trim();
    if (!allowedDates.has(date) || !allowedTimes.has(time)) {
      throw new Error('현재 주에 포함되지 않는 시간입니다.');
    }
    slotsByDate.get(date).add(time);
  });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('다른 저장 작업이 진행 중입니다.');

  try {
    const sheet = getSpreadsheet().getSheetByName(AVAILABILITY_SHEET_NAME);
    if (!sheet) throw new Error('availability 시트를 찾을 수 없습니다.');

    const values = sheet.getDataRange().getValues();
    const headers = getAvailabilityHeaders(sheet);
    const requiredHeaders = [
      'week_start', 'date', 'member_id', 'updated_at', 'revision', ...getTimeHeaders(),
    ];
    requiredHeaders.forEach((header) => {
      if (!headers.includes(header)) throw new Error(`필수 열이 없습니다: ${header}`);
    });

    const column = Object.fromEntries(
      headers.map((header, index) => [header, index]),
    );
    const existingRows = new Map();
    values.slice(1).forEach((row, index) => {
      const key = [
        normalizeDate(row[column.week_start]),
        normalizeDate(row[column.date]),
        String(row[column.member_id]).trim(),
      ].join('|');
      existingRows.set(key, { row, rowNumber: index + 2 });
    });

    const now = new Date();
    const rowsToAppend = [];
    weekDates.forEach((date) => {
      const key = `${weekStart}|${date}|${memberId}`;
      const existing = existingRows.get(key);
      const row = existing ? [...existing.row] : Array(headers.length).fill('');
      row[column.week_start] = weekStart;
      row[column.date] = date;
      row[column.member_id] = memberId;
      getTimeHeaders().forEach((time) => {
        row[column[time]] = slotsByDate.get(date).has(time) ? 1 : 0;
      });
      row[column.updated_at] = now;
      row[column.revision] = (Number(row[column.revision]) || 0) + 1;

      if (existing) {
        sheet.getRange(existing.rowNumber, 1, 1, headers.length).setValues([row]);
      } else {
        rowsToAppend.push(row);
      }
    });

    if (rowsToAppend.length > 0) {
      sheet.getRange(
        sheet.getLastRow() + 1,
        1,
        rowsToAppend.length,
        headers.length,
      ).setValues(rowsToAppend);
    }

    return {
      memberId,
      weekStart,
      updatedAt: Utilities.formatDate(now, TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    };
  } finally {
    lock.releaseLock();
  }
}

/** 서버가 신뢰할 현재 주 월요일을 한국 시간 기준으로 계산한다. */
function getCurrentWeekStart() {
  const now = new Date();
  const today = Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd');
  const dayOfWeek = Number(Utilities.formatDate(now, TIME_ZONE, 'u'));
  return addDays(today, -(dayOfWeek - 1));
}

/** yyyy-MM-dd 날짜 문자열에 날짜 수를 더한다. */
function addDays(dateText, days) {
  const [year, month, date] = dateText.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, date + days));
  return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
}

/** 00:00부터 23:30까지 30분 단위 헤더를 생성한다. */
function getTimeHeaders() {
  return Array.from({ length: 48 }, (_, index) => {
    const hour = String(Math.floor(index / 2)).padStart(2, '0');
    return `${hour}:${index % 2 === 0 ? '00' : '30'}`;
  });
}

/** Sheets가 시간 헤더를 자동 변환해도 이름 기반 열 계약을 유지한다. */
function getAvailabilityHeaders(sheet) {
  const values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const timeZone = getSpreadsheet().getSpreadsheetTimeZone();
  return values.map((value) => normalizeAvailabilityHeader(value, timeZone));
}

/** 문자열, 날짜 또는 숫자로 저장된 시간 헤더를 HH:mm 형식으로 통일한다. */
function normalizeAvailabilityHeader(value, timeZone) {
  if (value instanceof Date) return Utilities.formatDate(value, timeZone, 'HH:mm');

  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hour = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const minute = String(totalMinutes % 60).padStart(2, '0');
    return `${hour}:${minute}`;
  }

  const text = String(value).trim();
  const time = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!time) return text;

  const hour = Number(time[1]);
  const minute = Number(time[2]);
  if (hour > 23 || ![0, 30].includes(minute)) return text;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 날짜 셀과 문자열 날짜를 API 날짜 형식으로 통일한다. */
function normalizeDate(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TIME_ZONE, 'yyyy-MM-dd');
  return String(value || '').trim();
}

/** 수정 시각은 Sheets의 표시 형식과 무관한 ISO 형식으로 반환한다. */
function normalizeDateTime(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(value || '').trim();
}

/** 일정 셀의 대표적인 참 값을 허용한다. */
function isAvailable(value) {
  return new Set(['true', '1', 'yes', 'y']).has(
    String(value).trim().toLowerCase(),
  );
}

/** Script Properties의 식별자로 비공개 스프레드시트를 연다. */
function getSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID가 설정되지 않았습니다.');
  return SpreadsheetApp.openById(spreadsheetId);
}

/** 브라우저가 소비할 JSON 응답을 생성한다. */
function createJsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
