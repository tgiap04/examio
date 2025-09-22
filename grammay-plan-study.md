### Epic: Tích hợp học từ vựng Word Family bằng AI

---

#### 1. User Story: Sinh và hiển thị từ gốc theo Danh mục

**Như là** một người học,
**Tôi muốn** chọn một danh mục chủ đề (ví dụ: Dụng cụ, Công nghệ, ... các dnah mục này sẽ có thêm trang ở admin config để tạo các danh mục cũng như các hình ảnh đó, tuy nhiên cần có file seed để tạo các data cho các danh mục sau: 
1. mua sắm, nhà hàng
2. giao thông, công trường
3. nơi làm việc, thời gian rảnh rỗi
4. vị trí, chức danh
5. địa điểm, vị trí 
6. hội họp, công việc, văn phòng 
7. du lịch, giải trí
8. ngân hàng, bưu điện 
9. thông báo, hướng dẫn, quảng cáo
10. tin tức, phát thanh, du lịch 
bạn cần gen sẵn json có tên, mô tả, ảnh ( ảnh ban tự gen bằng ai luôn nhé )
) và nhận được danh sách các từ gốc (Root words) liên quan,
**Để** tôi có thể chọn một từ gốc làm điểm bắt đầu cho bài học.

* **Acceptance Criteria (Tiêu chí chấp nhận):**
* Khi người dùng click vào một danh mục, hệ thống hiển thị danh sách từ gốc (ví dụ 10-20 từ).
* **Giao diện:** Thiết kế danh sách hiển thị dạng raw text, lược bỏ các icon hoặc khung viền phức tạp, nhấn mạnh vào chính các từ vựng.
* **Kỹ thuật:** Nếu danh mục đã có người chọn trước đó, hệ thống ưu tiên lấy từ Global Database (đã cache) để trả về kết quả ngay lập tức mà không gọi AI. Nếu là danh mục mới hoàn toàn, gọi AI API và lưu kết quả vào DB.



#### 2. User Story: Xem chi tiết Word Family với Toggle View (Tree/List)

**Như là** một người học,
**Tôi muốn** xem chi tiết các biến thể (danh từ, động từ, tính từ) của từ gốc và có thể chuyển đổi giữa góc nhìn dạng Sơ đồ cây (Tree) và Danh sách (List),
**Để** tôi dễ dàng bao quát cấu trúc từ hoặc đọc chi tiết từng câu ví dụ tùy theo nhu cầu.

* **Acceptance Criteria (Tiêu chí chấp nhận):**
* Mặc định hiển thị chỉ bao gồm tiếng Anh và Từ loại. Nghĩa tiếng Việt và Câu ví dụ chỉ hiện ra khi click/hover (chức năng ẩn/hiện).
* Chuyển đổi giữa Tree View và List View phải diễn ra ngay lập tức ở client-side (Frontend state), không được reload trang.
* Ở Tree View: Các nhánh nối hiển thị bằng các đường kẻ nét mảnh, cấu trúc phân nhánh rõ ràng từ Root ra các Part of Speech.
* Ở List View: Hiển thị kèm checkbox bên cạnh mỗi từ để phục vụ cho tính năng tạo Flashcard.
* Hậu tố/Tiền tố (Prefix/Suffix) của từ biến thể phải được highlight (ví dụ in đậm hoặc đổi màu mờ) so với từ gốc.



#### 3. User Story: Lưu bộ từ vựng cá nhân

**Như là** một người học,
**Tôi muốn** lưu lại toàn bộ cấu trúc Word Family đang xem vào thư mục cá nhân của mình,
**Để** tôi có thể mở ra ôn tập lại bất kỳ lúc nào mà không bị mất dữ liệu.

* **Acceptance Criteria (Tiêu chí chấp nhận):**
* Có nút "Lưu bộ từ vựng" (Save Collection) trên giao diện.
* Khi lưu thành công, hệ thống hiển thị thông báo nhỏ (toast notification).
* **Kỹ thuật:** Phải lưu dữ liệu theo dạng tham chiếu (Reference ID) vào tài khoản người dùng, tham chiếu tới bản ghi JSON đã lưu ở Global Database. Kiến trúc DB cần đảm bảo truy xuất bộ từ đã lưu với độ phức tạp thời gian là $O(1)$.



#### 4. User Story: Tích hợp tạo Flashcard từ Word Family

**Như là** một người học,
**Tôi muốn** chọn một, nhiều, hoặc toàn bộ các từ trong một Word Family và nhấn chuyển thành bộ Flashcard,
**Để** tôi tận dụng tính năng Flashcard có sẵn để luyện tập lặp lại ngắt quãng.

* **Acceptance Criteria (Tiêu chí chấp nhận):**
* Trong chế độ List View, người dùng có thể tick chọn các từ mong muốn (có nút "Select All").
* Khi bấm nút "Tạo bộ Flashcard", hệ thống tự động gom các từ đã chọn và tạo một Deck mới trong module Flashcard hiện tại.
* Tên Deck tự động được đặt theo format: `Gia đình từ: [Root word]`.
* Dữ liệu tự động map chính xác: Mặt trước là Từ vựng; Mặt sau là Từ loại, Nghĩa Tiếng Việt và Câu ví dụ.



---

Bạn có muốn tôi format lại bộ User Story này thành các Task/Subtask dưới dạng Markdown Checkbox để bạn có thể copy-paste thẳng vào công cụ quản lý dự án trên GitHub Issues không?