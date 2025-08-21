// === Import thư viện ===
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// === 🔑 Thay bằng file Service Account JSON tải từ Google Cloud ===
// Đảm bảo file JSON để cùng thư mục với script
const credentials = require('./create-service-account-465314-1e86ec6d74f4.json');

// === Cấu hình Zalo OA ===
// 👉 Thay bằng App ID & Secret Key của OA bạn
const app_id = 'YOUR_APP_ID';
const secret_key = 'YOUR_SECRET_KEY';

// === Cấu hình Google Sheet ===
// 👉 Thay bằng Google Sheet ID của bạn (trong URL sheet)
// Ví dụ: https://docs.google.com/spreadsheets/d/1nlGR1HTefQWUX9vTzW8Kj2J_WD3OR__SiQtWk48-QvQ/edit#gid=0
const SHEET_ID = 'YOUR_SHEET_ID';

// 👉 Thay đúng range trong sheet để lưu token
// Ở đây mình giả sử có sheet tên "token" và lưu vào dòng 2
const RANGE = 'token!A2:D2'; 

// 👉 File JSON token local (chỉ để app khác đọc nhanh)
const token_file_path = path.join(__dirname, 'zalo-access-token.json');

// === Hàm ghi token mới vào Google Sheet ===
async function saveTokensToGoogleSheet(accessToken, refreshToken, updatedAt, expiresIn) {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const values = [[accessToken, refreshToken, updatedAt, expiresIn]];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  console.log('📄 Đã ghi token mới vào Google Sheet!');
}

// === Hàm lấy token cũ từ Google Sheet ===
async function getTokensFromSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });

  const values = res.data.values?.[0];
  if (!values || values.length < 4) {
    throw new Error('❌ Không tìm thấy refresh_token hoặc expires_in trong Sheet!');
  }

  return {
    access_token: values[0],
    refresh_token: values[1],
    updated_at: values[2],
    expires_in: Number(values[3]),
  };
}

console.log('🚀 Script bắt đầu');

// === Hàm refresh token ===
async function refreshZaloAccessToken() {
  try {
    const tokens = await getTokensFromSheet();
    console.log('🎯 Tokens lấy từ Sheet:', tokens);

    const { refresh_token: oldRefreshToken } = tokens;

    if (!oldRefreshToken) {
      throw new Error('❌ Không tìm thấy refresh_token trong Sheet!');
    }

    console.log('🔄 Bắt đầu gọi API refresh token với refresh_token:', oldRefreshToken);

    const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': secret_key,
      },
      body: new URLSearchParams({
        refresh_token: oldRefreshToken,
        app_id: app_id,
        grant_type: 'refresh_token',
      }),
    });

    const raw = await res.text();
    console.log('📥 Raw response từ API Zalo:', raw);

    let data;
    try {
      data = JSON.parse(raw);
      console.log('✅ Đã parse JSON thành công:', data);
    } catch (err) {
      throw new Error('❌ Phản hồi không phải JSON hợp lệ!');
    }

    if (data.access_token && data.refresh_token && data.expires_in) {
      const updated_at_new = new Date().toISOString();

      const newTokenData = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        updated_at: updated_at_new,
      };

      // Lưu ra file local
      fs.writeFileSync(token_file_path, JSON.stringify(newTokenData, null, 2), 'utf8');
      console.log('✅ Đã cập nhật file zalo-access-token.json:', token_file_path);
      console.log('🔑 Access token mới:', data.access_token);

      // Ghi vào Google Sheet
      await saveTokensToGoogleSheet(
        data.access_token,
        data.refresh_token,
        updated_at_new,
        data.expires_in
      );
    } else {
      console.error('❌ Không nhận được access_token hoặc refresh_token:', data);
    }
  } catch (error) {
    console.error('❌ Lỗi:', error.message || error);
  }
}

refreshZaloAccessToken()
  .finally(() => process.exit(0));
