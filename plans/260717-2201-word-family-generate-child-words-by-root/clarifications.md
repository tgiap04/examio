# Clarifications — Word Family: generate child words by root

## Session 2026-07-17
- Q: Nguồn từ gốc trên trang detail (.../order)? → A: Chỉ dùng từ gốc trong URL (1-click "Sinh từ con cho '<rootWord>'"), không nhập tay
- Q: Khi từ gốc đã có word family thì xử lý sao? → A: Ghi đè / sinh lại (upsert WordFamily.data JSON)
- Q: Discipline? → A: Auto (chạy liền mạch, không rest point). Không commit khi chưa được cho phép (theo CLAUDE.md)
- Q: Đồng bộ hay async job? → A: Đồng bộ — FE await POST, nút loading, refetch detail sau khi xong (1 root word sinh nhanh, không cần polling như flow category)
