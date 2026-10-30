# Docker và bản sao ngoài máy tới Dropbox

Các bước này cần được thực hiện và kiểm thử trên máy chủ của bạn. Không gửi `.env`, cấu hình rclone, mã OAuth hay khóa mã hóa qua chat hoặc đưa vào Git. Kết nối Dropbox trong Arena **không** tự cấp quyền cho tiến trình chạy trên máy chủ.

## Docker: một tiến trình và ổ dữ liệu bền vững

1. Cài Docker Engine và Docker Compose trên máy chủ Linux. Dùng staging riêng trước; kiểm tra [checklist staging](staging-checklist.md).
2. Sao chép `.env.example` thành `.env`, giới hạn quyền đọc (ví dụ `chmod 600 .env`). Tạo `SECRET` ngẫu nhiên, ổn định tối thiểu 32 byte bằng trình quản lý bí mật; đặt `ADMIN_PASSWORD` mạnh cho lần tạo database mới. Cấu hình SMTP nếu sử dụng. Compose đọc `.env` từ thư mục dự án; không đưa file này vào image hoặc Git. Các biến môi trường vẫn có thể xem được bởi người có quyền quản trị Docker, nên phải kiểm soát quyền Docker.
3. Chuẩn bị thư mục `SAKURA_DATA_DIR` trên ổ bền vững. Container chạy bằng user `node` (UID/GID 1000 trong image); thư mục và dữ liệu hiện có phải cho phép UID/GID này đọc/ghi. Không thay đổi quyền của dữ liệu production trước khi sao lưu và xác nhận chủ sở hữu. Không dùng ổ tạm hoặc chia sẻ một thư mục cho nhiều server.
4. Chạy `docker compose config --quiet` (không in cấu hình chứa bí mật), rồi `docker compose up -d --build`. Kiểm tra `docker compose ps`, trạng thái health và log. Health chỉ chứng minh HTTP server phản hồi, không chứng minh backup/email hoạt động.
5. Compose chỉ mở ứng dụng trên `127.0.0.1` của máy chủ. Cấu hình reverse proxy HTTPS riêng, firewall và `TRUSTED_PROXIES` theo IP/CIDR proxy **thực tế mà container nhìn thấy**; địa chỉ này phụ thuộc topology Docker và không được đoán. Nếu để trống, các client sau proxy có thể cùng bị giới hạn theo IP proxy. Khởi động lại container sau khi đổi cấu hình.
6. Không tăng `replicas`, không chạy container thứ hai cùng thư mục dữ liệu. `docker compose down` không xóa bind mount, nhưng vẫn phải có backup độc lập. Cập nhật image, cấu hình proxy và các gói hệ điều hành định kỳ.

## Dropbox: rclone crypt và tác vụ trên máy chủ

Ứng dụng tạo backup JSON **không mã hóa** trong `data/auto-backups/`, mặc định mỗi 60 phút, giữ 48 bản. Script `scripts/offsite-backup.sh` chỉ sao chép file backup hoàn chỉnh; dùng `rclone crypt` để mã hóa cả nội dung và tên trước khi gửi. Đây là tác vụ host độc lập, không chạy trong container. Chưa có giám sát hoặc dọn bản Dropbox tự động.

1. Cài rclone và `flock` trên host. Dùng `rclone config` theo hướng dẫn chính thức của rclone để tạo remote Dropbox, hoàn thành OAuth an toàn trên máy chủ/máy cá nhân của bạn; sau đó tạo một **crypt remote** bọc một thư mục riêng trên remote Dropbox. Crypt password và salt phải là bí mật riêng; lưu bản dự phòng khóa ở nơi an toàn **ngoài** Dropbox đó. Ai có config/khóa có thể đọc backup; nếu mất khóa, không thể phục hồi. Khóa truy cập Dropbox nên có quyền tối thiểu theo khả năng cấu hình của nhà cung cấp.
2. Đảm bảo thư mục cấu hình rclone chỉ user chạy tác vụ đọc được và không đưa vào image/Git. Tác vụ dùng cấu hình rclone của user chạy nó. Script kiểm tra remote có kiểu `crypt`, nhưng không thể xác nhận remote bên dưới thật sự nằm ở Dropbox; tự xác minh đường dẫn khi cấu hình.
3. Sau khi container tạo backup, chạy thử trên staging (thay đường dẫn và tên remote của bạn):

   ```sh
   ./scripts/offsite-backup.sh /duong/dan/data ten_crypt_remote
   ```

   Lệnh dùng `rclone copy --immutable`, không xóa file từ Dropbox. Nó chỉ báo kết quả lệnh sao chép, không chứng minh có thể phục hồi hoặc bản backup mới nhất luôn có mặt. Lỗi trả về mã khác 0; tác vụ đồng thời thứ hai bị từ chối.
4. Cấu hình systemd timer hoặc cron của host chạy lệnh này định kỳ, với đường dẫn tuyệt đối và user có quyền đọc backup/rclone config và ghi file lock trong data. Các file mẫu trong `deploy/sakura-offsite-backup.*.example` chạy mỗi 15 phút: sao chép vào `/etc/systemd/system/` bỏ đuôi `.example`, chỉnh `User` và `ExecStart` trong service cho đúng host, rồi chạy `systemctl daemon-reload` và `systemctl enable --now sakura-offsite-backup.timer`. Kiểm tra `systemctl list-timers` và `journalctl -u sakura-offsite-backup.service`, chạy thử service thủ công sau khi container đã tạo backup. Đặt chu kỳ ngắn hơn thời gian giữ local (mặc định 48 giờ), và cấu hình **cảnh báo bên ngoài** khi job lỗi hoặc bản sao ngoài máy quá cũ. Không dùng `sync`: file bị xóa tại nguồn không được tự động xóa khỏi Dropbox. Với việc giữ vô thời hạn, lập chính sách dung lượng và dọn bản Dropbox riêng sau khi xác minh; không xóa bản duy nhất còn khôi phục được.
5. Từ một máy riêng hoặc môi trường staging, dùng cùng crypt remote để tải bản sao về thư mục được bảo vệ. Kiểm tra và phục hồi theo README trên một database thử độc lập, sau đó xác nhận tài khoản, tồn kho và đơn hàng. Lặp lại định kỳ. Bản sao chứa dữ liệu cá nhân và hash mật khẩu; xóa bản tải về an toàn theo chính sách của bạn.

Gián đoạn kéo dài hơn thời gian giữ local có thể làm mất các điểm phục hồi chưa kịp tải lên. Bản SHA-256 không chứng minh nguồn gốc; kiểm soát quyền truy cập Dropbox và khóa. Mã hóa không thay thế thử phục hồi và giám sát.
