# TODO — Urban Alert Platform

Danh sách việc để phát triển dần. Mỗi mục là **một việc nhỏ, làm và kiểm tra trong một lần**.
Làm xong thì đổi `[ ]` thành `[x]`.

- **Cỡ:** S ≈ dưới nửa ngày · M ≈ 1–2 ngày · L ≈ cần chia nhỏ thêm khi bắt đầu.
- **Xong khi:** điều kiện để coi là hoàn thành. Chưa đạt thì chưa tick.
- Khi nhờ Claude, giao **một mục mỗi lần**, ví dụ: "làm mục 1.1 trong docs/TODO.md".

Trạng thái hiện tại (1/11/2026): luồng báo sự cố → kiểm duyệt → cảnh báo đã chạy end-to-end trên máy
local; 203 unit test và 7 integration test; có Postman collection cho luồng chính.

---

## Giai đoạn 0 — Dọn dẹp

- [ ] **0.1 Tạo git repo và commit đầu tiên** · S
  - `git init`, commit cả `yarn.lock`.
  - Xong khi: `git status` sạch, `yarn.lock` có trong commit.
- [ ] **0.2 Duyệt 18 quyết định thiết kế** · S
  - Trang duyệt: https://claude.ai/artifact/KFn7tWadEAcsuMb2PPwk3f → "Sao chép phản hồi" → gửi cho Claude.
  - Xong khi: mọi mục là "Đồng ý" hoặc đã sửa theo "Cần đổi".
- [ ] **0.3 Gỡ `console.log` tạm thời** · S
  - Sửa ở: tìm `TODO(temporary)` trong `apps/notification-service`.
  - Xong khi: không còn `TODO(temporary)`; `yarn lint` và `yarn test` pass.
- [ ] **0.4 Bật comment khi dán lệnh trong zsh** · S
  - Thêm `setopt interactivecomments` vào `~/.zshrc`.

---

## Giai đoạn 1 — Tính năng còn thiếu cho app

- [ ] **1.1 API xác nhận / cập nhật sự cố người khác đã báo** · M
  - `POST /incidents/{id}/reports` với `{ description? }`, chỉ cho sự cố VERIFIED hoặc ACTIVE; mỗi người
    một lần cho mỗi sự cố.
  - Sửa ở: `apps/incident-service` (bảng `IncidentReport` đã có sẵn).
  - Xong khi: có unit test và integration test; endpoint hiện trong Swagger; thêm vào trang duyệt contract.
- [ ] **1.2 Xem danh sách xác nhận của một sự cố** · S
  - `GET /incidents/{id}/reports`, kèm số lượt xác nhận trong chi tiết sự cố.
  - Xong khi: có test; chi tiết sự cố trả thêm `confirmationCount`.
- [ ] **1.3 Người dùng báo "sự cố đã hết"** · M
  - Tuỳ kết quả quyết định #2: gợi ý moderator đóng, hoặc tự chuyển RESOLVED khi đủ N người báo.
  - Xong khi: quy tắc được ghi vào ADR và có test.
- [ ] **1.4 Upload ảnh bằng presigned URL** · L (chia nhỏ khi bắt đầu)
  - Thêm MinIO vào `docker-compose.yml`; API cấp URL upload; `POST /incidents` chỉ nhận URL của bucket mình.
  - Xong khi: app upload ảnh rồi tạo sự cố bằng URL đó; có test kiểm tra URL lạ bị từ chối.
- [ ] **1.5 Luồng từ chối trong Postman** · S
  - Thêm thư mục vào `docs/postman/urban-alert-main-flow.postman_collection.json`: báo → từ chối → An nhận
    `REPORT_REJECTED` kèm lý do.
  - Xong khi: Collection Runner chạy xanh cả hai luồng.
- [ ] **1.6 Đồng bộ case kiểm duyệt khi admin đổi trạng thái trực tiếp** · S
  - moderation-service nghe `incident.verified` / `incident.rejected` và đóng case còn mở.
  - Xong khi: PATCH status ở incident-service thì case tương ứng không còn ở hàng chờ; có test.
- [ ] **1.7 Bỏ API trùng đọc tuỳ chọn thông báo** · S
  - Tuỳ quyết định #16: giữ `GET /users/me/notification-preferences`, bỏ `GET /notifications/preferences`.
  - Xong khi: Swagger và trang contract chỉ còn một API.

---

## Giai đoạn 2 — Độ tin cậy

- [ ] **2.1 Outbox: bảng và ghi trong transaction** · M
  - Bảng `outbox_events` cho incident-service; ghi sự kiện cùng transaction với thay đổi dữ liệu.
  - Xong khi: tắt Kafka rồi tạo sự cố, sự cố vẫn tạo được và sự kiện nằm trong `outbox_events`.
- [ ] **2.2 Outbox: worker đẩy sự kiện lên Kafka** · M
  - Đọc `outbox_events` chưa gửi → publish → đánh dấu đã gửi; xử lý khi Kafka chết rồi sống lại.
  - Xong khi: bật lại Kafka thì sự kiện tồn đọng được gửi; consumer không xử lý trùng.
- [ ] **2.3 Outbox cho moderation-service, auth-service, user-service** · M
  - Áp dụng lại 2.1–2.2. Xong khi: ADR-007 được cập nhật thành "đã làm".
- [ ] **2.4 Gửi lại thông báo bị kẹt PENDING** · S
  - Job định kỳ trong notification-service gửi lại thông báo PENDING quá 1 phút.
  - Xong khi: có test; thông báo kẹt được gửi sau khi service khởi động lại.
- [ ] **2.5 Dọn refresh token hết hạn** · S
  - Job hằng ngày xoá token hết hạn hoặc đã thu hồi quá 7 ngày.
  - Xong khi: có test; bảng `auth.refresh_tokens` không phình mãi.
- [ ] **2.6 Script phát lại message trong dead-letter topic** · S
  - `yarn dlt:replay <topic>` đẩy message từ `<topic>.dlt` về topic gốc.
  - Xong khi: chạy được với một message lỗi giả lập.
- [ ] **2.7 Rate limit theo người dùng** · S
  - Có token thì giới hạn theo userId, không có thì theo IP (quyết định #18).
  - Xong khi: có test; hai người dùng chung IP không chặn lẫn nhau.

---

## Giai đoạn 3 — Trang quản trị

- [ ] **3.1 API quản trị người dùng** · M
  - Danh sách người dùng, đổi role, khoá / mở khoá tài khoản; chỉ ADMIN (quyết định #14).
  - Xong khi: có test phân quyền; người bị khoá không đăng nhập hoặc refresh được.
- [ ] **3.2 API thống kê** · M
  - Số sự cố theo ngày, loại, trạng thái; thời gian từ lúc báo đến lúc duyệt.
  - Xong khi: có test với dữ liệu seed.
- [ ] **3.3 Khung admin-web** · M
  - Repo hoặc thư mục `admin-web/` riêng: React + Vite + Refine; đăng nhập bằng `/auth/login`.
  - Xong khi: moderator đăng nhập vào được trang trống.
- [ ] **3.4 Màn hàng chờ kiểm duyệt** · M
  - Danh sách case, chi tiết kèm bản đồ (Leaflet) và báo cáo có thể trùng; nút Duyệt / Từ chối / Yêu cầu
    bổ sung.
  - Xong khi: duyệt được một case từ giao diện, không cần Swagger hay Postman.
- [ ] **3.5 Màn danh sách sự cố** · M
  - Lọc theo trạng thái, loại; xem lịch sử; chuyển ACTIVE → RESOLVED.
- [ ] **3.6 Màn người dùng và thống kê** · M
  - Dùng API của 3.1 và 3.2.

---

## Giai đoạn 4 — Vận hành

- [ ] **4.1 Gom log tập trung** · M
  - Ghi log ra file hoặc gửi về Loki; xem được log của cả 6 service theo `correlationId`.
- [ ] **4.2 Metrics** · M
  - Prometheus + Grafana: số request, độ trễ, lỗi, lag của consumer Kafka.
- [ ] **4.3 CI với GitHub Actions** · S
  - Lint, typecheck, test, build cho mỗi pull request; integration test chạy với service containers.
  - Xong khi: PR đỏ khi test lỗi.
- [ ] **4.4 Chạy cả 6 service bằng Docker Compose** · S
  - Profile `apps` trong `docker-compose.yml`, dùng `infrastructure/docker/Dockerfile`.
  - Xong khi: `docker compose --profile apps up` chạy được luồng Postman.
- [ ] **4.5 Thử push FCM thật** · S
  - Điền `FCM_*` trong `.env`, đăng ký token thật từ app Flutter.
  - Xong khi: điện thoại nhận được cảnh báo khi duyệt sự cố.

---

## Giai đoạn 5 — Trước khi lên production

- [ ] **5.1 JWT RS256 + JWKS** · M: chỉ auth-service giữ private key.
- [ ] **5.2 Quản lý secret** · S: không còn secret trong `.env` trên server.
- [ ] **5.3 Bảo mật kết nối** · M: TLS ở gateway; Kafka có xác thực; Redis có mật khẩu.
- [ ] **5.4 Triển khai AWS** · L: chia nhỏ khi bắt đầu (RDS + PostGIS, MSK hoặc Kafka tự quản, ElastiCache, ECS/EKS).
- [ ] **5.5 Thông báo đa ngôn ngữ** · S: chuyển chữ tiếng Việt viết cứng sang theo `locale` của người dùng.

---

## Nâng cấp sau (không gấp)

- [ ] Prisma 6 → 7 (chuyển cấu hình sang `prisma.config.ts`).
- [ ] NestJS 11 → 12 (chuyển sang ES modules).
- [ ] `kafkajs` → `@confluentinc/kafka-javascript` (`kafkajs` đã ngừng phát triển).
