"""
Semantic-based query analysis for metadata filtering
Replaces keyword matching with semantic similarity for better accuracy
"""

from typing import Dict, Any, List, Optional
import numpy as np
try:
    from src.llm.gemini_embeddings import GeminiEmbeddings
    GEMINI_EMBEDDINGS_AVAILABLE = True
except ImportError:
    from sentence_transformers import SentenceTransformer
    GEMINI_EMBEDDINGS_AVAILABLE = False
    print("⚠️  GeminiEmbeddings not available, falling back to SentenceTransformer")
import json
import os
from pathlib import Path
from .metadata_config import get_metadata_config
from dotenv import load_dotenv
load_dotenv()
class SemanticQueryAnalyzer:
    def __init__(self):
        self.model = None
        self.model_type = None
        self.department_templates = None
        self.education_templates = None
        # Cache pre-computed embeddings
        self._dept_embeddings_cache = {}
        self._edu_embeddings_cache = {}
        self._cache_initialized = False
        self._initialize_templates()
    
    def _get_model(self):
        """Lazy loading of the embedding model - Gemini or SentenceTransformer"""
        if self.model is None:
            if GEMINI_EMBEDDINGS_AVAILABLE:
                try:
                    # Use Gemini embeddings
                    self.model = GeminiEmbeddings()
                    self.model_type = "gemini"
                    print("🔗 Using Gemini embeddings")
                except Exception as e:
                    print(f"⚠️  Failed to initialize Gemini embeddings: {e}")
                    print("🔄 Falling back to SentenceTransformer...")
                    self.model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
                    self.model_type = "sentence_transformer"
            else:
                # Fallback to SentenceTransformer
                self.model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
                self.model_type = "sentence_transformer"
                print("📦 Using SentenceTransformer with multilingual model")
        
        return self.model
    
    def _encode_text(self, texts: List[str]) -> np.ndarray:
        """Encode texts using the appropriate model"""
        model = self._get_model()
        
        if self.model_type == "gemini":
            # Gemini embeddings return list of embeddings
            if isinstance(texts, str):
                texts = [texts]
            embeddings = model.embed_documents(texts)
            return np.array(embeddings)
        else:
            # SentenceTransformer 
            return model.encode(texts)
    
    def _initialize_templates(self):
        """Initialize semantic templates based on actual data folder content"""
        
        # First load static templates based on document analysis
        self._load_static_templates()
        
        # Then enhance with dynamic content from data folder
        self._enhance_templates_from_data_folder()
    
    def _load_static_templates(self):
        """Load static semantic templates based on document analysis"""
        
        # Department semantic templates - based on real document analysis
        self.department_templates = {
            'phongdaotao': [
                "quy chế đào tạo đại học chính quy theo hệ thống tín chỉ",
                "tổ chức đào tạo và học kỳ phụ trong năm học",
                "đăng ký khối lượng học tập và kế hoạch học tập",
                "kiểm tra học phần và điểm kiểm tra thường xuyên",
                "thi kết thúc học phần và điểm thi kết thúc",
                "cách tính điểm và thang điểm đánh giá",
                "quy định về cố vấn học tập và giáo viên chủ nhiệm",
                "xếp hạng năm đào tạo và học lực sinh viên",
                "tỷ lệ phần trăm tín chỉ tích lũy theo từng năm đào tạo",
                "sinh viên năm thứ nhất thứ hai thứ ba thứ tư thứ năm",
                "số tín chỉ phải tích lũy của chương trình đào tạo",
                "20% 40% 60% 80% tổng số tín chỉ toàn khóa học",
                "điều kiện tốt nghiệp và xét tốt nghiệp",
                "chương trình giáo dục và mục tiêu đào tạo các bậc học",
                "quản lý lớp học và lớp học phần",
                "quy định thực hiện và chấm điểm đề án tốt nghiệp thạc sĩ"
            ],
            'phongkhaothi': [
                "quy định về công tác khảo thí và tổ chức thi cử",
                "điều kiện và số lần dự thi kết thúc học phần",
                "điều kiện dự thi kết thúc học phần HVSV được phép dự thi",
                "đóng học phí lệ phí đầy đủ điều kiện dự thi",
                "điểm quá trình đạt ngưỡng đảm bảo chất lượng",
                "tham gia tối thiểu 75% số giờ học trên lớp",
                "chưa được công nhận thi đạt và chưa sử dụng hết số lần dự thi",
                "kiểm tra thường xuyên và thi giữa kỳ",
                "thi kết thúc học phần và thi tốt nghiệp", 
                "đồ án luận văn đề án tốt nghiệp",
                "hội đồng đảm bảo chất lượng giáo dục",
                "hoạt động đảm bảo chất lượng giáo dục tại HVKTMM",
                "quy định về hoạt động đảm bảo chất lượng giáo dục",
                "giám sát và thanh tra công tác thi cử",
                "phòng thi và quy trình tổ chức kỳ thi",
                "xử lý vi phạm và kỷ luật trong thi cử",
                "đánh giá và kiểm định chất lượng đào tạo",
                "ngưỡng đảm bảo chất lượng và điều kiện hoãn thi",
                "cán bộ coi thi và cán bộ chấm thi",
                "phúc khảo bài thi và xử lý chênh lệch điểm"
            ],
            'khoa': [
                "kế hoạch học tập ngành và chương trình đào tạo",
                "chương trình giáo dục đại học các ngành học",
                "mục tiêu đào tạo và chương trình chuyên ngành",
                "các ngành học chuyên môn kỹ thuật và công nghệ",
                "chuyên ngành an toàn thông tin ATTT",
                "chuyên ngành công nghệ thông tin CNTT", 
                "chuyên ngành kỹ thuật mật mã và bảo mật",
                "chuyên ngành điện tử viễn thông",
                "kiến thức cơ sở ngành và môn học chuyên ngành",
                "các khoa và ngành học chuyên môn kỹ thuật",
                "bộ môn và hoạt động giảng dạy chuyên ngành",
                "giảng viên bộ môn và cán bộ giảng dạy",
                "nghiên cứu khoa học trong lĩnh vực chuyên môn",
                "phát triển chương trình giáo dục chuyên ngành"
            ],
            'thongtinhvktmm': [
                "quy chế hoạt động xét công nhận sáng kiến trong Ban Cơ yếu",
                "hoạt động xét công nhận sáng kiến trong Ban Cơ yếu Chính phủ",
                "phong trào thi đua Ban Cơ yếu Chính phủ thi đua đổi mới",
                "triển khai phong trào bình dân học vụ số",
                "quyết định ban hành khung kiến thức kỹ năng số cơ bản",
                "quy chế quản lý sử dụng hệ thống hỗ trợ làm việc từ xa",
                "quyết định thành lập tổ ứng dụng CNTT HVKTMM",
                "thông tin chung về Học viện Kỹ thuật mật mã",
                "Ban Cơ yếu Chính phủ và các hoạt động tổ chức",
                "chuyển đổi số và ứng dụng công nghệ thông tin",
                "sáng kiến cải tiến và đổi mới sáng tạo"
            ],
            'viennghiencuuvahoptacphattrien': [
                "quy chế hoạt động khoa học và công nghệ KHCN",
                "thống nhất quy cách viết báo cáo khoa học",
                "quản lý hoạt động hợp tác của Học viện KTMM",
                "nhiệm vụ khoa học và công nghệ cấp trên và cấp cơ sở",
                "hoạt động nghiên cứu khoa học và phát triển công nghệ",
                "hợp tác quốc tế và chuyển giao công nghệ",
                "quản lý dự án và đề tài nghiên cứu khoa học",
                "xuất bản và công bố kết quả nghiên cứu",
                "phát triển và ứng dụng công nghệ mới",
                "hợp tác với các đơn vị trong và ngoài nước"
            ],
           
        }
        
        # Education level semantic templates - only for phongdaotao structure
        self.education_templates = {
            'daihoc': [
                "sinh viên đại học và chương trình cử nhân",
                "bậc học đại học và trình độ bachelor", 
                "quy chế đào tạo đại học chính quy theo hệ thống tín chỉ",
                "chương trình giáo dục đại học hệ chính quy",
                "mục tiêu đào tạo đại học và kiến thức cử nhân",
                "kế hoạch học tập ngành đại học",
                "đào tạo trình độ đại học và sinh viên"
            ],
            'thacsi': [
                "học viên thạc sĩ và chương trình master",
                "đào tạo trình độ thạc sĩ và cao học",
                "quy định thực hiện và chấm điểm đề án tốt nghiệp thạc sĩ",
                "chương trình sau đại học bậc thạc sĩ",
                "nghiên cứu nâng cao và thạc sĩ khoa học",
                "đề án tốt nghiệp và luận văn thạc sĩ"
            ],
            'tiensi': [
                "nghiên cứu sinh và chương trình tiến sĩ",
                "đào tạo trình độ tiến sĩ và PhD",
                "nghiên cứu khoa học cấp cao và luận án",
                "chương trình tiến sĩ và nghiên cứu sinh",
                "hoạt động nghiên cứu khoa học tiến sĩ"
            ],
            'giangvien': [
                "giảng viên và đội ngũ giảng dạy",
                "cán bộ giảng dạy và giáo viên",
                "hoạt động giảng dạy và giáo dục",
                "phát triển đội ngũ giảng viên",
                "cố vấn học tập và giáo viên chủ nhiệm"
            ]
        }
    
    def _enhance_templates_from_data_folder(self):
        """Enhance templates with actual document names from data folder"""
        try:
            # Get the data folder path relative to this file
            current_dir = Path(__file__).parent.parent.parent
            data_dir = current_dir / "data"
            
            if not data_dir.exists():
                print(f"⚠️  Data folder not found at {data_dir}")
                return
            
            # Process each department folder
            for dept_folder in data_dir.iterdir():
                if not dept_folder.is_dir():
                    continue
                    
                dept_name = dept_folder.name.lower()
                if dept_name not in self.department_templates:
                    continue
                
                # Extract document titles and add as templates
                doc_templates = self._extract_document_templates(dept_folder)
                if doc_templates:
                    # Add unique templates to existing ones
                    existing = set(self.department_templates[dept_name])
                    for template in doc_templates:
                        if template not in existing:
                            self.department_templates[dept_name].append(template)
                    
                    print(f"📁 Enhanced {dept_name} with {len(doc_templates)} document-based templates")
                
                # Only process education levels for phongdaotao
                if dept_name == 'phongdaotao':
                    education_templates = self._extract_education_templates(dept_folder)
                    if education_templates:
                        for edu_level, templates in education_templates.items():
                            if edu_level in self.education_templates:
                                existing = set(self.education_templates[edu_level])
                                for template in templates:
                                    if template not in existing:
                                        self.education_templates[edu_level].append(template)
                        print(f"🎓 Enhanced education levels with templates from {dept_name}")
        
        except Exception as e:
            print(f"⚠️  Error enhancing templates from data folder: {e}")
    
    def _extract_document_templates(self, dept_folder: Path) -> List[str]:
        """Extract semantic templates from document names in a department folder"""
        templates = []
        
        def process_folder(folder: Path, level_prefix: str = ""):
            for item in folder.iterdir():
                if item.is_file() and item.suffix.lower() in ['.txt', '.docx', '.pdf']:
                    # Clean filename to create semantic template
                    filename = item.stem
                    # Remove numbering and clean up
                    clean_name = self._clean_document_name(filename)
                    if clean_name:
                        if level_prefix:
                            clean_name = f"{level_prefix} {clean_name}"
                        templates.append(clean_name.lower())
                elif item.is_dir():
                    # Recursively process subfolders (like daihoc, thacsi, etc.)
                    subfolder_prefix = item.name
                    process_folder(item, subfolder_prefix)
        
        process_folder(dept_folder)
        return list(set(templates))  # Remove duplicates
    
    def _extract_education_templates(self, phongdaotao_folder: Path) -> Dict[str, List[str]]:
        """Extract education level templates from phongdaotao subfolders"""
        education_templates = {}
        
        for item in phongdaotao_folder.iterdir():
            if item.is_dir():
                level_name = item.name.lower()
                if level_name in ['daihoc', 'thacsi', 'tiensi', 'giangvien']:
                    templates = []
                    for doc in item.iterdir():
                        if doc.is_file() and doc.suffix.lower() in ['.txt', '.docx', '.pdf']:
                            clean_name = self._clean_document_name(doc.stem)
                            if clean_name:
                                templates.append(f"{level_name} {clean_name}".lower())
                    
                    if templates:
                        education_templates[level_name] = templates
        
        return education_templates
    
    def _clean_document_name(self, filename: str) -> str:
        """Clean document filename to create meaningful semantic template"""
        # Remove leading numbers and dots
        import re
        cleaned = re.sub(r'^[\d\.]+\s*', '', filename)
        
        # Remove common prefixes
        cleaned = re.sub(r'^(Quy định|Quyết định|Ban hành|Thông tư)\s*', '', cleaned, flags=re.IGNORECASE)
        
        # Remove file extensions and version info
        cleaned = re.sub(r'\s*\([^)]*\)$', '', cleaned)  # Remove (version) at end
        cleaned = re.sub(r'\s*ver\s*\d+.*$', '', cleaned, flags=re.IGNORECASE)
        
        # Trim and return if meaningful
        cleaned = cleaned.strip()
        return cleaned if len(cleaned) > 10 else ""  # Only return if meaningful length
    
    def _initialize_embeddings_cache(self):
        """Pre-compute and cache all template embeddings"""
        if self._cache_initialized:
            return
        
        print("🚀 Initializing embeddings cache...")
        
        # Cache department embeddings
        for dept, templates in self.department_templates.items():
            self._dept_embeddings_cache[dept] = self._encode_text(templates)
        
        # Cache education level embeddings  
        for level, templates in self.education_templates.items():
            self._edu_embeddings_cache[level] = self._encode_text(templates)
        
        self._cache_initialized = True
        print("✅ Embeddings cache initialized successfully!")
    
    def analyze_query_semantic(self, query: str, confidence_threshold: float = 0.60) -> Dict[str, Any]:
        """
        Analyze query using semantic similarity instead of keyword matching
        
        Args:
            query: User query to analyze
            confidence_threshold: Minimum confidence score to apply filtering
            
        Returns:
            Dictionary with detected metadata filters and confidence scores
        """
        model = self._get_model()
        result = {
            'filters': {},
            'confidence_scores': {},
            'use_metadata_filtering': False,
            'reasoning': ''
        }
        
        # Check if query contains generic department terms that should search full DB
        generic_terms = ['phòng', 'ban', 'khoa', 'trung tâm', 'viện', 'nhiệm vụ', 'chức năng']
        query_lower = query.lower()
        
        # If query mentions specific but unknown departments, use full search
        if any(term in query_lower for term in generic_terms):
            unknown_dept_indicators = ['thiết bị', 'quản trị', 'hành chính', 'tài chính', 'chính trị']
            if any(indicator in query_lower for indicator in unknown_dept_indicators):
                result['reasoning'] = f"Generic department query detected - using full database search"
                return result
        
        # Ensure embeddings cache is initialized
        self._initialize_embeddings_cache()
        
        # Store query for education level analysis
        self._last_query = query
        
        # Encode the query ONCE
        query_embedding = self._encode_text([query])
        
        # Analyze department using cached embeddings
        dept_result = self._analyze_department_cached(query_embedding)
        if dept_result['confidence'] >= confidence_threshold:
            result['filters']['department'] = dept_result['department']
            result['confidence_scores']['department'] = dept_result['confidence']
            result['use_metadata_filtering'] = True
        
        # Analyze education level - only for phongdaotao department
        if dept_result['department'] == 'phongdaotao':
            level_result = self._analyze_education_level_cached(query_embedding)
            if level_result['confidence'] >= confidence_threshold:
                result['filters']['education_level'] = level_result['education_level']
                result['confidence_scores']['education_level'] = level_result['confidence']
                result['use_metadata_filtering'] = True
        
        # Generate reasoning
        reasoning_parts = []
        if 'department' in result['filters']:
            reasoning_parts.append(f"Department: {result['filters']['department']} (confidence: {result['confidence_scores']['department']:.2f})")
        if 'education_level' in result['filters']:
            reasoning_parts.append(f"Education Level: {result['filters']['education_level']} (confidence: {result['confidence_scores']['education_level']:.2f})")
        
        if result['use_metadata_filtering']:
            result['reasoning'] = f"Semantic analysis detected: {'; '.join(reasoning_parts)}"
        else:
            result['reasoning'] = f"Low confidence scores - using full database search (threshold: {confidence_threshold})"
        
        return result
    
    def _analyze_department_cached(self, query_embedding: np.ndarray) -> Dict[str, Any]:
        """Analyze department using cached embeddings"""
        best_dept = None
        best_score = 0.0
        
        for dept, cached_embeddings in self._dept_embeddings_cache.items():
            # Calculate similarity with cached embeddings
            similarities = np.dot(query_embedding, cached_embeddings.T).flatten()
            max_similarity = np.max(similarities)
            
            if max_similarity > best_score:
                best_score = max_similarity
                best_dept = dept
        
        return {
            'department': best_dept,
            'confidence': float(best_score)
        }
    
    def _analyze_education_level_cached(self, query_embedding: np.ndarray) -> Dict[str, Any]:
        """Analyze education level using cached embeddings"""
        # Store query for analysis
        if hasattr(self, '_last_query'):
            query_text = self._last_query.lower()
            
            # Skip education level detection for general queries about year classification
            if any(keyword in query_text for keyword in ['năm mấy', 'năm thứ', 'phần trăm', '%', 'tỷ lệ', 'tích lũy']):
                return {
                    'education_level': None, 
                    'confidence': 0.0
                }
        
        best_level = None
        best_score = 0.0
        
        for level, cached_embeddings in self._edu_embeddings_cache.items():
            # Calculate similarity with cached embeddings
            similarities = np.dot(query_embedding, cached_embeddings.T).flatten()
            max_similarity = np.max(similarities)
            
            if max_similarity > best_score:
                best_score = max_similarity
                best_level = level
        
        return {
            'education_level': best_level,
            'confidence': float(best_score)
        }
    
    def _analyze_department(self, query_embedding: np.ndarray, model) -> Dict[str, Any]:
        """Analyze department using semantic similarity"""
        best_dept = None
        best_score = 0.0
        
        for dept, templates in self.department_templates.items():
            # Encode all templates for this department
            template_embeddings = self._encode_text(templates)
            
            # Calculate similarity with query
            similarities = np.dot(query_embedding, template_embeddings.T).flatten()
            
            # Use max similarity as the score for this department
            max_similarity = np.max(similarities)
            
            if max_similarity > best_score:
                best_score = max_similarity
                best_dept = dept
        
        return {
            'department': best_dept,
            'confidence': float(best_score)
        }
    
    def _analyze_education_level(self, query_embedding: np.ndarray, model) -> Dict[str, Any]:
        """Analyze education level using semantic similarity"""
        best_level = None
        best_score = 0.0
        
        for level, templates in self.education_templates.items():
            # Encode all templates for this level
            template_embeddings = self._encode_text(templates)
            
            # Calculate similarity with query
            similarities = np.dot(query_embedding, template_embeddings.T).flatten()
            
            # Use max similarity as the score for this level
            max_similarity = np.max(similarities)
            
            if max_similarity > best_score:
                best_score = max_similarity
                best_level = level
        
        return {
            'education_level': best_level,
            'confidence': float(best_score)
        }
    
    def get_department_mapping(self) -> Dict[str, str]:
        """Get Vietnamese names for departments"""
        config = get_metadata_config()
        mapping = {}
        
        folder_mappings = config.config.get('folder_mappings', {})
        for folder_name, folder_config in folder_mappings.items():
            dept_vn = folder_config.get('department_vn', '')
            if dept_vn:
                mapping[folder_config.get('department', folder_name)] = dept_vn
        
        return mapping

# Global instance for reuse
_semantic_analyzer = None

def get_semantic_analyzer() -> SemanticQueryAnalyzer:
    """Get singleton instance of semantic analyzer"""
    global _semantic_analyzer
    if _semantic_analyzer is None:
        _semantic_analyzer = SemanticQueryAnalyzer()
    return _semantic_analyzer

def analyze_query_semantic_filter(query: str, confidence_threshold: float = 0.60) -> Dict[str, Any]:
    """
    Main function to replace analyze_query_for_metadata_filter
    
    Args:
        query: User query to analyze
        confidence_threshold: Minimum confidence score to apply filtering
        
    Returns:
        Dictionary with metadata filters or empty dict for full search
    """
    analyzer = get_semantic_analyzer()
    result = analyzer.analyze_query_semantic(query, confidence_threshold)
    
    # Handle case where result might be None
    if result is None:
        print("⚠️  Semantic analysis returned None - using full database search")
        return {}
    
    print(f"🔍 Semantic Analysis: {result['reasoning']}")
    
    # Return only the filters for compatibility with existing code
    if result['use_metadata_filtering']:
        return result['filters']
    else:
        # Return empty dict to indicate no filtering (search full DB)
        return {}