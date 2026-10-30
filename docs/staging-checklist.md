# Kiểm tra staging trước khi bán hàng

Checklist này không xác nhận cửa hàng đã sẵn sàng production. Dùng một bản cài đặt, cơ sở dữ liệu, tên miền, tài khoản và bí mật **riêng cho staging**; không sao chép dữ liệu khách hàng thật. Chỉ kiểm thử tải hoặc dịch vụ của bên thứ ba khi được phép. Không tạo giao dịch/chuyển tiền thật nếu chưa có sự đồng ý của chủ tài khoản.

## 1. Chuẩn bị môi trường

- [ ] Cài Node.js 22.13 trở lên, chạy `npm ci` và `npm test` trong môi trường phát triển/CI. Chạy `CHROMIUM_PATH=/đường/dẫn/chromium npm run test:browser` khi có Chromium; các test này tạo dữ liệu tạm và không dùng dữ liệu cửa hàng.
- [ ] Cấu hình lưu trữ bền vững cho `data/`, giới hạn quyền truy cập và bảo đảm chỉ có **một** tiến trình server dùng dữ liệu này. SQLite hiện lưu snapshot JSON trong bộ nhớ của một tiến trình; không chạy nhiều replica dùng chung database.
- [ ] Trong trình quản lý bí mật của môi trường, cấu hình `NODE_ENV=production`, `SECRET` ngẫu nhiên và ổn định (tối thiểu 32 byte), cùng `ADMIN_PASSWORD` mạnh khi tạo dữ liệu mới. Không ghi bí mật vào repo hoặc gửi trong chat.
- [ ] Dừng server cũ và sao lưu `data/db.json` trước khi nâng cấp từ phiên bản JSON; xem mục chuyển dữ liệu trong README. Với staging, chỉ dùng bản dữ liệu thử riêng và kiểm tra kết quả nhập.
- [ ] Dùng HTTPS cho tên miền staging. Kiểm tra cookie đăng nhập có `Secure`, `HttpOnly`, `SameSite=Lax`; đảm bảo cookie không được gửi qua HTTP. Không công khai server kiểm thử với mật khẩu mẫu.

## 2. Proxy và giới hạn truy cập

- [ ] Xác định địa chỉ/dải **thực tế** của các proxy được quản lý. Chỉ đặt các địa chỉ đó trong `TRUSTED_PROXIES`; không tin toàn bộ Internet hay dải người dùng. Giới hạn kết nối trực tiếp tới backend bằng firewall hoặc mạng riêng.
- [ ] Đảm bảo proxy xóa `X-Forwarded-For` từ client hoặc thêm đúng IP nguồn thực tế vào cuối chuỗi; xem mục proxy trong README.
- [ ] Trên staging, dùng tài khoản thử và ít nhất hai nguồn IP được phép để xác nhận mỗi client được tính đúng; kiểm tra header giả mạo không vượt được giới hạn. Tránh thử trên tài khoản admin thật: các giới hạn có thể khóa tài khoản tạm thời.
- [ ] Xác minh các ngưỡng giới hạn hiện tại phù hợp lưu lượng và proxy thực tế. `SECRET` phải ổn định để bộ đếm vẫn hoạt động sau restart. File backup JSON không bao gồm bộ đếm; khi phục hồi, bộ đếm bị đặt lại.

## 3. Email và thanh toán

- [ ] Cấu hình SMTP với TLS và địa chỉ gửi do nhà cung cấp cho phép. Dùng hai hộp thư thử được kiểm soát để kiểm tra nhận mã, mã mới vô hiệu mã cũ, hết hạn và thu hồi phiên sau đổi mật khẩu. Theo dõi lỗi gửi và thư rác; không ghi lại hoặc chia sẻ mã.
- [ ] Kiểm tra và xác nhận với chủ cửa hàng ngân hàng, số tài khoản và tên người nhận trong cấu hình. Trên staging dùng thông tin thử phù hợp; QR hiển thị không chứng minh tiền đã được nhận.
- [ ] Thống nhất và kiểm tra quy trình **đối soát thủ công**, COD, hủy và hoàn tiền với cửa hàng. Chỉ admin xác nhận `paid` sau khi kiểm tra giao dịch; nút khách báo chuyển khoản không xác nhận giao dịch thực.
- [ ] Với những chuyển khoản thử, chỉ thực hiện giao dịch thật sau khi chủ tài khoản và các bên liên quan chấp thuận. Không dùng thông tin thanh toán thật trong báo cáo kiểm thử công khai.

## 4. Sao lưu và phục hồi

- [ ] Kiểm tra trang quản trị và log cho biết sao lưu tự động không bị tắt/lỗi; kiểm tra file sao lưu có quyền truy cập phù hợp. Trạng thái chỉ phản ánh tiến trình hiện tại và không xác minh file còn tồn tại.
- [ ] Cấu hình sao chép **tự động** tới một nơi lưu trữ riêng theo chính sách hạ tầng, bảo vệ/mã hóa khi truyền và lưu, kiểm soát quyền truy cập và lưu khóa riêng. Ứng dụng chỉ tự động sao lưu **trên cùng máy**; có thể thiết lập tác vụ host với rclone crypt theo [hướng dẫn Docker và Dropbox](docker-dropbox.md), nhưng tác vụ này chưa được bật mặc định.
- [ ] Phục hồi bản sao vào một bản cài đặt staging riêng, xác nhận tài khoản, đơn hàng và tồn kho; thử quy trình đối soát đơn phát sinh sau thời điểm sao lưu. Phục hồi xóa phiên và mã khôi phục, đồng thời tạo file pre-restore nhạy cảm.
- [ ] Thử quy trình báo lỗi, thiếu dung lượng và khôi phục sau mất máy; theo dõi tuổi bản sao ngoài máy và thử phục hồi định kỳ. SHA-256 trong file chỉ phát hiện hỏng dữ liệu, không xác thực nguồn gốc.

## 5. Đơn hàng và giám sát

- [ ] Trên desktop và điện thoại thật, kiểm tra đăng ký, đăng nhập, giỏ hàng, thay đổi giá/tồn, QR/COD, theo dõi trạng thái, hủy và thao tác admin.
- [ ] Thử mất mạng ngay sau khi gửi đơn, mở lại trang thanh toán và xác nhận đơn được tìm lại mà không trừ kho hai lần. Thử hai tab cùng tài khoản; thao tác dùng HTTPS/localhost và trình duyệt hỗ trợ Web Locks.
- [ ] Test API tự động có một kịch bản 24 yêu cầu cạnh tranh 12 sản phẩm và 20 yêu cầu dùng cùng idempotency key. Đây chỉ là **kiểm tra tính đúng**, không chứng minh sức chịu tải hay khả năng phục vụ nhiều tiến trình. Đo tải riêng trên staging theo lưu lượng dự kiến, kèm CPU, bộ nhớ, dung lượng và độ trễ; không chạy tải lên production khi chưa được phép.
- [ ] Thiết lập giám sát và cảnh báo bên ngoài cho uptime, lỗi ứng dụng, dung lượng, tuổi bản sao ngoài máy và email. `/api/health` chỉ xác nhận server trả lời; trạng thái SMTP ở admin không chứng minh thư đã đến hộp nhận.
- [ ] Ghi nhận kết quả, người chịu trách nhiệm và phương án dừng/khôi phục trước khi cho phép khách thật truy cập.
