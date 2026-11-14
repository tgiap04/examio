import pytest

from src.graphrag.query.router import classify, fold


@pytest.mark.parametrize(
    "query",
    [
        "Tài liệu này nói về gì?",
        "tai lieu nay noi ve gi",
        "Tóm tắt tài liệu giúp mình",
        "TOM TAT noi dung",
        "Cho mình tổng quan về chương 2",
        "Nội dung chính của file là gì",
        "Các ý chính của bài",
        "Liệt kê các chủ đề được đề cập",
        "Give me an overview of this document",
        "Please summarize the paper",
        "What is the main idea?",
        "What are the main points",
    ],
)
def test_overview_questions_are_global(query):
    assert classify(query) == "global"


@pytest.mark.parametrize(
    "query",
    [
        "AES khác RSA ở điểm nào?",
        "Hàm băm tóm lược dữ liệu như thế nào",
        "Thuật toán Dijkstra hoạt động ra sao",
        "tôm hùm là gì",
        "What does the paper say about overfitting in section 3?",
        "Define a Feistel network",
        "",
    ],
)
def test_specific_questions_stay_local(query):
    assert classify(query) == "local"


def test_fold_removes_diacritics_and_case():
    assert fold("Đường Tổng QUAN") == "duong tong quan"
