"""
Semantic Department Detector
Sử dụng dual-signal approach:
1. User metadata department
2. Query content similarity với department embeddings

Resolve conflicts bằng semantic similarity
"""
import os
import json
import logging
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from pathlib import Path

from src.llm.gemini_embeddings import GeminiEmbeddings
from langchain_core.documents import Document

logger = logging.getLogger(__name__)


@dataclass
class DepartmentSignal:
    """Tín hiệu phòng ban từ 1 nguồn"""
    department: str
    confidence: float  # 0.0 - 1.0
    source: str  # "user_metadata", "query_keywords", "semantic_similarity"
    details: Dict[str, Any] = None


@dataclass
class DepartmentDecision:
    """Quyết định cuối cùng về phòng ban"""
    chosen_department: str
    confidence: float
    signals: List[DepartmentSignal]
    reasoning: str
    conflict_detected: bool = False
    permission_granted: bool = True


class SemanticDepartmentDetector:
    """
    Detector sử dụng dual-signal + semantic similarity
    """
    
    def __init__(self, embeddings_dir: str = "department_embeddings"):
        self.embeddings_dir = embeddings_dir
        self.department_embeddings: Dict[str, np.ndarray] = {}
        self.embedding_model = None
        
        # Department access permissions
        self.department_permissions = {
            'admin': {'all': True},  # Admin có quyền access tất cả
            'phongdaotao': {'phongdaotao': True, 'common': True},
            'phongkhaothi': {'phongkhaothi': True, 'common': True},
            'khoa': {'khoa': True, 'common': True},
            'viennghiencuuvahoptacphattrien': {'viennghiencuuvahoptacphattrien': True, 'common': True},
            'thongtinhvktmm': {'thongtinhvktmm': True, 'common': True},
            'student': {'common': True, 'phongdaotao': True},  # Sinh viên chỉ xem đào tạo + chung
        }
        
        # Keywords cho fallback detection
        self.department_keywords = {
            'phongdaotao': [
                # Core education keywords
                'đào tạo', 'học tập', 'sinh viên', 'học viên', 'giảng viên', 'khóa học', 'chương trình',
                'đại học', 'thạc sĩ', 'tiến sĩ', 'cử nhân', 'cao học', 'luận văn', 'luận án',
                'k68', 'k69', 'k70', 'học phí', 'tuyển sinh', 'tốt nghiệp',
                # Academic scoring - SPECIFIC PHRASES
                'điểm học phần', 'cách tính điểm', 'tính điểm', 'công thức điểm',
                'điểm trung bình', 'điểm tích lũy', 'xếp loại học tập',
                # Course management
                'học phần', 'tín chỉ', 'môn học', 'bài tập', 'thời khóa biểu',
                'lịch học', 'phòng học', 'giáo trình', 'đề cương'
            ],
            'phongkhaothi': [
                # Core examination keywords  
                'khảo thí', 'thi', 'kiểm tra', 'đánh giá', 'chất lượng',
                'quy đổi điểm', 'toeic', 'ielts', 'toefl', 'cambridge', 'tiếng anh',
                'kỳ thi', 'đề thi', 'coi thi', 'chấm thi', 
                # Regulations and rules - HIGH PRIORITY
                'quy định', 'công tác khảo thí', 'quy chế thi', 'kỷ luật thi',
                'phòng thi', 'giám thị', 'thí sinh', 'bài thi', 'điểm thi',
                # Specific exam processes
                'thi kết thúc', 'thi giữa kỳ', 'thi phụ', 'phúc khảo',
                'miễn thi', 'hoãn thi', 'thi lại', 'coi thi', 'chấm thi'
            ],
            'khoa': [
                'khoa', 'ngành', 'chuyên ngành', 'attt', 'cntt', 'dtvt', 'an toàn thông tin',
                'công nghệ thông tin', 'điện tử viễn thông', 'bộ môn', 'giáo trình'
            ],
            'viennghiencuuvahoptacphattrien': [
                'nghiên cứu', 'khoa học', 'hợp tác', 'phát triển', 'đề tài', 'dự án',
                'công bố', 'tạp chí', 'hội thảo', 'báo cáo', 'sáng chế'
            ],
            'thongtinhvktmm': [
                'học viện', 'hvktmm', 'cơ yếu', 'chuyển đổi số', 'sáng kiến',
                'giới thiệu', 'lịch sử', 'tổ chức', 'ban giám hiệu'
            ]
        }
        
        # Load embeddings if available
        self._load_department_embeddings()
        
    def _init_embedding_model(self):
        """Initialize embedding model"""
        if self.embedding_model is None:
            try:
                self.embedding_model = GeminiEmbeddings()
                logger.info("✅ Embedding model initialized")
            except Exception as e:
                logger.warning(f"⚠️ Could not initialize embedding model: {e}")
                logger.warning("Falling back to keyword-based detection")
                
    def _load_department_embeddings(self):
        """Load pre-computed department embeddings"""
        embeddings_file = Path(self.embeddings_dir) / "department_embeddings.json"
        
        if embeddings_file.exists():
            try:
                with open(embeddings_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                for dept, embedding_list in data.items():
                    self.department_embeddings[dept] = np.array(embedding_list)
                
                logger.info(f"✅ Loaded embeddings for {len(self.department_embeddings)} departments")
                
            except Exception as e:
                logger.warning(f"⚠️ Could not load department embeddings: {e}")
        else:
            logger.warning(f"⚠️ Department embeddings not found: {embeddings_file}")
            logger.info("Will need to build department embeddings first")
    
    def build_department_embeddings(self, documents_by_dept: Dict[str, List[Document]]):
        """
        Build representative embeddings cho từng department
        Chỉ tính từ các file có đuôi .md
        """
        logger.info("🧠 BUILDING DEPARTMENT EMBEDDINGS (MD files only)")
        logger.info("=" * 60)
        
        self._init_embedding_model()
        if self.embedding_model is None:
            raise ValueError("Cannot build embeddings without embedding model")
        
        os.makedirs(self.embeddings_dir, exist_ok=True)
        
        for dept, documents in documents_by_dept.items():
            if len(documents) == 0:
                logger.warning(f"⚠️ No documents for {dept}, skipping")
                continue
                
            # Filter chỉ các file .md
            md_documents = []
            for doc in documents:
                source = doc.metadata.get('source', '')
                if source.lower().endswith('.md'):
                    md_documents.append(doc)
            
            if len(md_documents) == 0:
                logger.warning(f"⚠️ No .md documents for {dept}, skipping")
                continue
                
            logger.info(f"📄 Processing {dept}: {len(md_documents)} .md documents (filtered from {len(documents)} total)")
            
            # Combine all document content for department
            combined_text = []
            for doc in md_documents:
                content = doc.page_content[:1000]  # Limit per doc
                combined_text.append(content)
            
            # Create representative text (sample from each document)
            representative_text = " ".join(combined_text[:5])  # Top 5 docs
            
            try:
                # Get embedding for representative text
                embedding = self.embedding_model.embed_query(representative_text)
                self.department_embeddings[dept] = np.array(embedding)
                
                logger.info(f"   ✅ Created embedding: {len(embedding)} dimensions")
                
            except Exception as e:
                logger.error(f"   ❌ Failed to create embedding for {dept}: {e}")
        
        # Save embeddings to disk
        embeddings_data = {}
        for dept, embedding in self.department_embeddings.items():
            embeddings_data[dept] = embedding.tolist()
        
        embeddings_file = Path(self.embeddings_dir) / "department_embeddings.json"
        with open(embeddings_file, 'w', encoding='utf-8') as f:
            json.dump(embeddings_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"💾 Saved embeddings to: {embeddings_file}")
        logger.info(f"✅ Department embeddings built successfully!")
    
    def get_user_department_signal(self, user_metadata: Dict[str, Any]) -> Optional[DepartmentSignal]:
        """
        Tín hiệu 1: Department từ user metadata
        """
        dept = user_metadata.get('department', '').lower()
        role = user_metadata.get('role', 'student').lower()
        
        if not dept:
            # Fallback based on role
            if role == 'admin':
                return DepartmentSignal(
                    department='admin',
                    confidence=0.9,
                    source='user_metadata',
                    details={'role': role, 'fallback': True}
                )
            else:
                return None
        
        # Map department names
        dept_mapping = {
            'đào tạo': 'phongdaotao',
            'dao tao': 'phongdaotao',
            'phòng đào tạo': 'phongdaotao',
            'khảo thí': 'phongkhaothi', 
            'khao thi': 'phongkhaothi',
            'phòng khảo thí': 'phongkhaothi'
        }
        
        normalized_dept = dept_mapping.get(dept, dept)
        
        return DepartmentSignal(
            department=normalized_dept,
            confidence=0.95,  # User metadata có độ tin cậy cao
            source='user_metadata',
            details={'original_dept': dept, 'role': role}
        )
    
    def get_query_keyword_signal(self, query: str, top_k: int = 2) -> List[DepartmentSignal]:
        """
        Tín hiệu 2: Department từ query keywords (fallback)
        """
        query_lower = query.lower()
        department_scores = {}
        
        # High-priority phrase patterns
        phrase_patterns = {
            'phongkhaothi': [
                'công tác khảo thí', 'quy định khảo thí', 'kỷ luật thi', 
                'quy chế thi', 'công tác thi', 'phòng thi'
            ],
            'phongdaotao': [
                'điểm học phần', 'cách tính điểm', 'điểm trung bình',
                'chương trình đào tạo', 'kế hoạch học tập'
            ]
        }
        
        # Score cho phrase matching
        for dept, phrases in phrase_patterns.items():
            phrase_score = 0
            matched_phrases = []
            
            for phrase in phrases:
                if phrase in query_lower:
                    phrase_score += len(phrase.split()) * 3
                    matched_phrases.append(phrase)
            
            if phrase_score > 0:
                department_scores[dept] = {
                    'score': phrase_score,
                    'matched': matched_phrases,
                    'type': 'phrase'
                }
        
        # Score cho keyword matching
        for dept, keywords in self.department_keywords.items():
            keyword_score = 0
            matched_keywords = []
            
            for keyword in keywords:
                if keyword in query_lower:
                    weight = len(keyword.split())
                    
                    # Special weighting rules
                    if dept == 'phongdaotao' and 'điểm' in keyword:
                        if keyword == 'điểm học phần':
                            weight *= 2
                        elif keyword == 'điểm':
                            weight *= 0.5
                    
                    if dept == 'phongkhaothi' and keyword == 'quy định':
                        weight *= 1.5
                    
                    keyword_score += weight
                    matched_keywords.append(keyword)
            
            if keyword_score > 0:
                current_score = department_scores.get(dept, {'score': 0})['score']
                department_scores[dept] = {
                    'score': current_score + keyword_score,
                    'matched': department_scores.get(dept, {}).get('matched', []) + matched_keywords,
                    'type': 'mixed' if current_score > 0 else 'keyword'
                }
        
        # Convert to signals
        sorted_depts = sorted(department_scores.items(), key=lambda x: x[1]['score'], reverse=True)
        
        signals = []
        for dept, info in sorted_depts[:top_k]:
            confidence = min(info['score'] / 10.0, 1.0)  # Normalize score
            
            signal = DepartmentSignal(
                department=dept,
                confidence=confidence,
                source='query_keywords',
                details=info
            )
            signals.append(signal)
        
        return signals
    
    def get_semantic_similarity_signal(self, query: str, candidate_departments: List[str]) -> List[DepartmentSignal]:
        """
        Tín hiệu 3: Semantic similarity với department embeddings
        """
        if not self.department_embeddings:
            logger.warning("⚠️ No department embeddings available for semantic similarity")
            return []
        
        self._init_embedding_model()
        if self.embedding_model is None:
            logger.warning("⚠️ No embedding model available")
            return []
        
        try:
            # Get query embedding
            query_embedding = np.array(self.embedding_model.embed_query(query))
            
            similarities = {}
            for dept in candidate_departments:
                if dept in self.department_embeddings:
                    dept_embedding = self.department_embeddings[dept]
                    
                    # Cosine similarity
                    similarity = np.dot(query_embedding, dept_embedding) / (
                        np.linalg.norm(query_embedding) * np.linalg.norm(dept_embedding)
                    )
                    similarities[dept] = similarity
            
            # Convert to signals
            signals = []
            for dept, similarity in similarities.items():
                confidence = max(0.0, similarity)  # Clamp to [0, 1]
                
                signal = DepartmentSignal(
                    department=dept,
                    confidence=confidence,
                    source='semantic_similarity',
                    details={'similarity_score': float(similarity)}
                )
                signals.append(signal)
            
            # Sort by confidence
            signals.sort(key=lambda s: s.confidence, reverse=True)
            
            return signals
            
        except Exception as e:
            logger.error(f"❌ Error computing semantic similarity: {e}")
            return []
    
    def check_department_permission(self, user_role: str, user_dept: str, target_dept: str) -> bool:
        """
        Kiểm tra quyền truy cập department
        """
        # Admin có quyền access tất cả
        if user_role.lower() == 'admin':
            return True
        
        # Check trong permission table
        user_permissions = self.department_permissions.get(user_dept, {})
        
        # Check direct permission
        if user_permissions.get(target_dept, False):
            return True
        
        # Check 'all' permission
        if user_permissions.get('all', False):
            return True
        
        return False
    
    def resolve_department_conflicts(
        self,
        user_signal: Optional[DepartmentSignal],
        keyword_signals: List[DepartmentSignal],
        query: str,
        user_metadata: Dict[str, Any]
    ) -> DepartmentDecision:
        """
        Core logic: Resolve conflicts using semantic similarity
        """
        all_signals = []
        if user_signal:
            all_signals.append(user_signal)
        all_signals.extend(keyword_signals)
        
        if not all_signals:
            return DepartmentDecision(
                chosen_department='common',
                confidence=0.3,
                signals=[],
                reasoning="No signals detected, defaulting to common",
                conflict_detected=False
            )
        
        # Case 1: Chỉ có 1 signal hoặc tất cả signals đồng ý
        departments = [s.department for s in all_signals]
        if len(set(departments)) == 1:
            dept = departments[0]
            avg_confidence = sum(s.confidence for s in all_signals) / len(all_signals)
            
            return DepartmentDecision(
                chosen_department=dept,
                confidence=avg_confidence,
                signals=all_signals,
                reasoning="All signals agree on same department",
                conflict_detected=False
            )
        
        # Case 2: Có conflict → dùng semantic similarity để resolve
        logger.info("🔍 CONFLICT DETECTED - Using semantic similarity to resolve")
        
        candidate_depts = list(set(departments))
        semantic_signals = self.get_semantic_similarity_signal(query, candidate_depts)
        
        if semantic_signals:
            # Combine với các signals khác
            all_signals.extend(semantic_signals)
            
            # Weighted decision: semantic similarity có trọng số cao nhất
            weighted_scores = {}
            
            for signal in all_signals:
                dept = signal.department
                if dept not in weighted_scores:
                    weighted_scores[dept] = 0.0
                
                # Weighting theo source
                if signal.source == 'semantic_similarity':
                    weight = 2.0  # Highest weight
                elif signal.source == 'user_metadata':
                    weight = 1.5  # Medium weight  
                else:  # query_keywords
                    weight = 1.0  # Base weight
                
                weighted_scores[dept] += signal.confidence * weight
            
            # Choose department với highest weighted score
            chosen_dept = max(weighted_scores.items(), key=lambda x: x[1])[0]
            chosen_confidence = weighted_scores[chosen_dept] / sum(weighted_scores.values())
            
            # Check permission
            user_role = user_metadata.get('role', 'student')
            user_dept = user_signal.department if user_signal else 'student'
            permission_granted = self.check_department_permission(user_role, user_dept, chosen_dept)
            
            reasoning = f"Semantic similarity resolved conflict: {chosen_dept} (confidence: {chosen_confidence:.3f})"
            if not permission_granted:
                reasoning += f" - PERMISSION DENIED for {user_role}:{user_dept}"
            
            return DepartmentDecision(
                chosen_department=chosen_dept,
                confidence=chosen_confidence,
                signals=all_signals,
                reasoning=reasoning,
                conflict_detected=True,
                permission_granted=permission_granted
            )
        
        # Case 3: No semantic similarity available → fallback
        # Choose signal với confidence cao nhất
        best_signal = max(all_signals, key=lambda s: s.confidence)
        
        user_role = user_metadata.get('role', 'student')
        user_dept = user_signal.department if user_signal else 'student'
        permission_granted = self.check_department_permission(user_role, user_dept, best_signal.department)
        
        return DepartmentDecision(
            chosen_department=best_signal.department,
            confidence=best_signal.confidence,
            signals=all_signals,
            reasoning=f"Fallback to highest confidence signal: {best_signal.source}",
            conflict_detected=True,
            permission_granted=permission_granted
        )
    
    def detect_department(
        self,
        query: str,
        user_metadata: Dict[str, Any] = None
    ) -> DepartmentDecision:
        """
        Main API: Detect department using dual-signal approach
        """
        if user_metadata is None:
            user_metadata = {'role': 'student', 'department': ''}
        
        logger.info(f"🎯 DUAL-SIGNAL DEPARTMENT DETECTION")
        logger.info(f"Query: '{query[:100]}...'")
        logger.info(f"User: {user_metadata}")
        
        # Signal 1: User metadata
        user_signal = self.get_user_department_signal(user_metadata)
        
        # Check if user has no department metadata -> use document_graph
        user_dept = user_metadata.get('department', '').strip()
        if not user_dept:
            logger.info("📂 No user department metadata -> using document_graph")
            return DepartmentDecision(
                chosen_department='document_graph',
                confidence=0.8,
                signals=[],
                reasoning="No user department metadata, using document_graph for general queries",
                conflict_detected=False,
                permission_granted=True
            )
        
        if user_signal:
            logger.info(f"📊 User signal: {user_signal.department} (confidence: {user_signal.confidence})")
        
        # Signal 2: Query keywords
        keyword_signals = self.get_query_keyword_signal(query, top_k=2)
        for signal in keyword_signals:
            logger.info(f"📝 Keyword signal: {signal.department} (confidence: {signal.confidence})")
        
        # Resolve conflicts
        decision = self.resolve_department_conflicts(user_signal, keyword_signals, query, user_metadata)
        
        logger.info(f"🎯 DECISION: {decision.chosen_department} (confidence: {decision.confidence:.3f})")
        logger.info(f"📝 Reasoning: {decision.reasoning}")
        
        if decision.conflict_detected:
            logger.warning("⚠️ Conflict detected and resolved")
        
        if not decision.permission_granted:
            logger.warning("🚫 Permission denied!")
        
        return decision