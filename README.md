# 🌸 Sakura Music Shop — Website Bán Nhạc Cụ Phong Cách Anime

Website thương mại điện tử bán nhạc cụ hoàn chỉnh: **Node.js + Express + HTML/CSS/JavaScript thuần**,
giao diện phong cách anime (hoa anh đào rơi, gradient hồng-tím, hiệu ứng kính mờ),
đầy đủ đăng ký/đăng nhập, giỏ hàng, thanh toán **QR VietQR / chuyển khoản / COD**,
và **trang quản trị admin** quản lý đơn hàng, sản phẩm, khách hàng, doanh thu.

![theme](https://img.shields.io/badge/Theme-Anime%20Sakura-ff6fa5) ![node](https://img.shields.io/badge/Node.js-18%2B-brightgreen)

---

## 📌 1. Yêu cầu

- [Node.js](https://nodejs.org) phiên bản **18 trở lên** (nên dùng bản LTS 20.x)
- Trình soạn thảo **VSCode**
- Trình duyệt hiện đại: Chrome, Edge, Firefox, Cốc Cốc...

## 🚀 2. Cách chạy trên VSCode (làm lần lượt)

1. Mở **VSCode** → `File > Open Folder...` → chọn thư mục **`sakura-music`**.
2. Mở terminal trong VSCode: menu **Terminal → New Terminal** (phím tắt `` Ctrl+` ``).
3. Cài thư viện (chỉ làm lần đầu, mất ~30 giây):

   ```bash
   npm install
   ```

4. Khởi động server:

   ```bash
   npm start
   ```

5. Mở trình duyệt truy cập:

   | Trang | Đường link |
   |---|---|
   | 🏠 Trang chủ khách hàng | http://localhost:3000 |
   | 🛍️ Tất cả sản phẩm | http://localhost:3000/products.html |
   | 👑 **Trang quản trị admin** | http://localhost:3000/admin.html |

6. Dừng server: nhấn `Ctrl + C` trong terminal.

> 💡 Mẹo: nên cài extension **Live Server** thì **KHÔNG cần** — dự án này phải chạy bằng
> `npm start` vì có server backend xử lý đăng nhập, đơn hàng, QR.

## 👤 3. Tài khoản có sẵn (đã seed dữ liệu mẫu)

| Vai trò | Email | Mật khẩu |
|---|---|---|
| 👑 Quản trị viên | `admin@sakura.vn` | `admin123` |
| 🧑 Khách hàng demo | `user@sakura.vn` | `123456` |

Hoặc bấm **Đăng ký** để tự tạo tài khoản khách hàng mới.

---

## 🧩 4. Các chức năng đã có

### Phía khách hàng
- ✅ Trang chủ: banner anime, danh mục, sản phẩm bán chạy, khuyến mãi, chính sách
- ✅ Danh sách sản phẩm: tìm kiếm, lọc theo danh mục, sắp xếp theo giá / đánh giá
- ✅ Trang chi tiết sản phẩm: ảnh, mô tả, sao đánh giá, chọn số lượng, mua ngay
- ✼ Giỏ hàng lưu trên trình duyệt (localStorage), cập nhật số lượng, phí ship, freeship từ 2 triệu
- ✅ **Đăng ký / Đăng nhập / Đăng xuất** (mật khẩu mã hóa bcrypt, cookie ký HMAC)
- ✅ **Quên mật khẩu**: nhận mã xác nhận 6 số (hiệu lực 15 phút) → đặt mật khẩu mới; mỗi mã chỉ dùng 1 lần
- ✅ Chống dò mật khẩu: **khóa đăng nhập 5 phút sau 5 lần nhập sai**
- ✅ Trang tài khoản: sửa hồ sơ, đổi mật khẩu, xem & hủy đơn, xem lại QR để thanh toán
- ✅ **Thanh toán: QR VietQR động, chuyển khoản ngân hàng, COD**
  - Mã QR tự điền **số tiền + nội dung chuyển khoản theo mã đơn**
  - Nút "Tôi đã chuyển khoản" để admin đối soát
- ✅ Liên kết **Facebook, Zalo, TikTok, YouTube, Instagram** (nút nổi góc màn hình + chân trang)
- ✅ Hiệu ứng: hoa anh đào rơi, nốt nhạc bay, marquee, hover lấp lánh, toast thông báo, responsive mobile

### Phía admin (`/admin.html`)
- 🔐 **Trang đăng nhập quản trị riêng `/admin-login.html` — BẮT BUỘC**: không có tài khoản admin thì không thể vào trang quản trị; tài khoản khách hàng bị từ chối ngay cả khi đã đăng nhập (API phía server cũng kiểm tra quyền, không thể vượt rào chỉ bằng cách gõ URL)
- 🔑 Admin **đặt lại mật khẩu** cho bất kỳ tài khoản khách nào ngay trong mục Người dùng
- 📊 **Dashboard**: doanh thu, số đơn, khách hàng, sản phẩm sắp hết hàng, biểu đồ doanh thu theo danh mục, đơn mới nhất
- 📦 **Quản lý đơn hàng**: xem chi tiết, lọc theo trạng thái, cập nhật trạng thái
  (chờ thanh toán → đã chuyển khoản → đã thanh toán → đang giao → hoàn thành / hủy), xuất file **CSV** mở bằng Excel
- 🎸 **Quản lý sản phẩm**: thêm / sửa / xóa, sửa giá, kho, ảnh, mô tả
- 👤 **Quản lý người dùng**: xem số đơn, tổng chi tiêu, xóa tài khoản khách
- 💳 Trang cấu hình hiển thị thông tin tài khoản ngân hàng & link mạng xã hội

## 🗂️ 5. Cấu trúc thư mục

```
sakura-music/
├── server.js               # Backend Express: API, xác thực, đơn hàng, admin
├── package.json
├── data/
│   └── db.json             # CSDL JSON (tự sinh khi chạy lần đầu)
├── node_modules/           # Thư viện (do npm install tạo ra)
└── public/                 # Toàn bộ giao diện
    ├── index.html          # Trang chủ
    ├── products.html       # Danh sách sản phẩm
    ├── product.html        # Chi tiết sản phẩm
    ├── cart.html           # Giỏ hàng
    ├── checkout.html       # Thanh toán QR / chuyển khoản / COD
    ├── login.html          # Đăng nhập khách hàng
    ├── register.html       # Đăng ký
    ├── forgot-password.html # Quên mật khẩu (mã xác nhận)
    ├── account.html        # Tài khoản khách + đơn hàng
    ├── admin-login.html    # 🔐 Trang đăng nhập RIÊNG của admin
    ├── admin.html          # Trang quản trị (tự đá về admin-login nếu chưa đăng nhập admin)
    ├── css/style.css       # Toàn bộ style anime
    ├── js/                 # JS từng trang + common.js dùng chung
    └── assets/img/         # Ảnh nền anime + 16 ảnh sản phẩm
```

## 💳 6. Thay tài khoản ngân hàng nhận tiền thật (QUAN TRỌNG)

Mặc định hệ thống đang dùng **tài khoản mẫu VietCombank `0123456789`**.
Để nhận tiền thật, mở file **`server.js`**, tìm khối `const BANK = { ... }` ở gần đầu file và sửa:

```js
const BANK = {
  bankCode: 'MB',                 // Mã ngân hàng (xem bảng bên dưới)
  bankName: 'Ngân hàng TMCP Quân đội (MB Bank)',
  shortName: 'MB Bank',
  accountNo: '0987654321',        // 👉 SỐ TÀI KHOẢN THẬT của bạn
  accountName: 'NGUYEN VAN A',    // 👉 TÊN CHỦ TK in hoa, không dấu
  hotline: '1900 6868',
  ...
};
```

Một số mã ngân hàng hay dùng cho dịch vụ **VietQR.io**:

| Ngân hàng | Mã |
|---|---|
| Vietcombank | `VCB` |
| VietinBank | `VTB` (hoặc `ICB`) |
| BIDV | `BIDV` |
| Techcombank | `TCB` |
| MB Bank | `MB` |
| ACB | `ACB` |
| TPBank | `TPB` |
| Agribank | `VBA` |
| Sacombank | `STB` |

Lưu ý: tên chủ tài khoản phải **in hoa, không dấu** đúng như ngân hàng khai báo.
Ảnh QR được tạo tự động qua dịch vụ miễn phí **https://img.vietqr.io** (cần có mạng khi xem QR).

## 🔗 7. Thay link mạng xã hội của shop

Trong `server.js`, hàm route `app.get('/api/config', ...)` sửa lại các link:

```js
social: {
  facebook:  'https://facebook.com/TRANG-CUA-BAN',
  zalo:      'https://zalo.me/SĐT-CỦA-BẠN',
  tiktok:    'https://tiktok.com/@KENH-CUA-BAN',
  youtube:   'https://youtube.com/@KENH-CUA-BAN',
  instagram: 'https://instagram.com/KENH-CUA-BAN',
}
```

## 🧪 8. Quy trình thử nghiệm một đơn hàng đầy đủ

1. Đăng ký tài khoản khách (hoặc dùng `user@sakura.vn / 123456`).
2. Vào **Sản phẩm** → thêm vài món vào giỏ → **Thanh toán**.
3. Chọn **Quét mã QR VietQR** → bấm **Đặt hàng** → màn hình hiện mã QR + STK + nội dung CK.
4. Bấm **Tôi đã chuyển khoản** (mô phỏng đã CK; với shop thật, khách quét QR bằng app ngân hàng).
5. Đăng nhập admin (`admin@sakura.vn / admin123`) tại `/admin.html`:
   - Vào **Đơn hàng** → mở đơn → đổi trạng thái thành **Đã thanh toán → Đang giao → Hoàn thành**.
   - Xem doanh thu cập nhật ở **Tổng quan**, xuất CSV nếu cần.

## 🔒 9. Lưu ý kỹ thuật

- Mật khẩu được băm **bcrypt**, cookie đăng nhập được ký **HMAC-SHA256**.
- Tính năng **quên mật khẩu** ở bản demo hiển thị luôn mã 6 số trên màn hình (vì chưa kết nối
  dịch vụ email). Khi triển khai thật, chạy server với biến môi trường `DEMO_MODE=0` và bổ sung
  hàm gửi mã qua email/SMS trong route `POST /api/auth/forgot-password` (mã đã được sinh sẵn,
  chỉ cần gửi đi thay vì trả về giao diện).
- Có giới hạn 5 lần đăng nhập sai / 5 phút cho mỗi email + IP.
- Dữ liệu lưu tại `data/db.json` — **xóa file này rồi khởi động lại** để reset toàn bộ về dữ liệu mẫu.
- Khi triển khai thật (lên mạng/VPS), nên đổi chuỗi `SECRET` trong `server.js` và thêm HTTPS.
- File này là dự án học tập/demo; để bán hàng thật cần bổ sung: cổng thanh toán thật (Momo/ZaloPay/Stripe),
  gửi email xác nhận, phân trang, xác thực OTP/SĐT... (có thể phát triển thêm dễ dàng trên nền code này).

---

🌸 **Chúc cậu bán được thật nhiều đàn!** 🎸🎹🎻
