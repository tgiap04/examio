"""
Department Graph Manager - ENHANCED WITH SEMANTIC SIMILARITY
Quản lý graph riêng biệt cho từng phòng ban/đơn vị
Sử dụng dual-signal approach với semantic similarity
"""
import os
import logging
from typing import Dict, List, Optional, Set, Any, Tuple
import networkx as nx
from langchain_core.documents import Document

from .graph_builder import DocumentGraph
from .subgraph_partitioner import SubgraphPartitioner
from .graph_retriever import GraphRoutedRetriever
from .semantic_department_detector import SemanticDepartmentDetector, DepartmentDecision

logger = logging.getLogger(__name__)


class DepartmentGraphManager:
    """
    Enhanced Department Graph Manager với semantic similarity
    Sử dụng dual-signal approach để detect department chính xác hơn
    """
    
    def __init__(self, base_output_dir: str = "department_graphs"):
        self.base_output_dir = base_output_dir
        self.department_graphs: Dict[str, DocumentGraph] = {}
        self.department_partitioners: Dict[str, SubgraphPartitioner] = {}
        self.department_retrievers: Dict[str, GraphRoutedRetriever] = {}
        
        # Initialize semantic detector
        self.semantic_detector = SemanticDepartmentDetector(
            embeddings_dir=os.path.join(base_output_dir, "embeddings")
        )
        
        # Mapping phòng ban từ đường dẫn
        self.department_mapping = {
            'phongdaotao': ['phongdaotao', 'dao_tao', 'daotao'],
            'phongkhaothi': ['phongkhaothi', 'khao_thi', 'khaothi', 'chat_luong'],
            'khoa': ['khoa'],
            'viennghiencuuvahoptacphattrien': ['viennghiencuu', 'nghien_cuu', 'hop_tac'],
            'thongtinhvktmm': ['thongtin', 'hvktmm', 'hoc_vien'],
            'document_graph': ['giao_trinh', 'chung']  # Tài liệu chung
        }
    
    def detect_department_from_path(self, file_path: str) -> str:
        """
        Xác định phòng ban từ đường dẫn file với logic cải tiến
        """
        file_path_lower = file_path.lower().replace('\\', '/').replace(' ', '_')
        
        # Handle specific file patterns first
        filename = os.path.basename(file_path_lower)
        
        # Khảo thí patterns
        if any(keyword in filename for keyword in ['khao_thi', 'khaothi', 'chat_luong', 'dam_bao_chat_luong', 'quy_dinh_cong_tac_khao_thi']):
            return 'phongkhaothi'
        
        # Đào tạo patterns 
        if any(keyword in filename for keyword in ['dao_tao', 'daotao', 'quy_che_dao_tao', 'trinh_do_dai_hoc', 'tin_chi', 'nang_luc_tieng_anh']):
            return 'phongdaotao'
            
        # Nghiên cứu patterns
        if any(keyword in filename for keyword in ['khcn', 'nghien_cuu', 'hop_tac', 'phat_trien']):
            return 'viennghiencuuvahoptacphattrien'
            
        # Thông tin HVKTMM patterns
        if any(keyword in filename for keyword in ['hoi_dong', 'hvktmm', 'hoc_vien']):
            return 'thongtinhvktmm'
        
        # Fallback to path-based detection
        
        for department, aliases in self.department_mapping.items():
            for alias in aliases:
                if alias in file_path_lower:
                    return department
        
        # Fallback: Check folder names
        path_parts = file_path_lower.split('/')
        for part in path_parts:
            for department, aliases in self.department_mapping.items():
                if part in aliases:
                    return department
        
        # Mặc định: document_graph (đã bỏ warning để giảm noise)
        return 'document_graph'  # Default
    
    def detect_department_smart(
        self, 
        query: str, 
        user_metadata: Dict[str, Any] = None,
        top_k: int = 2
    ) -> DepartmentDecision:
        """
        Smart department detection sử dụng dual-signal approach
        """
        return self.semantic_detector.detect_department(query, user_metadata)
    
    def detect_department_from_query(self, query: str, top_k: int = 2) -> List[str]:
        """
        Legacy method - kept for backward compatibility
        Sử dụng semantic detection nhưng trả về format cũ
        """
        decision = self.semantic_detector.detect_department(query, user_metadata={'role': 'student'})
        
        # Nếu permission denied, fallback to document_graph
        if not decision.permission_granted:
            logger.warning(f"🚫 Permission denied for department {decision.chosen_department}")
            return ['document_graph']
        
        # Return chosen department + fallbacks
        result = [decision.chosen_department]
        
        # Add other high-confidence departments as fallbacks
        for signal in decision.signals:
            if (signal.department != decision.chosen_department and 
                signal.confidence > 0.3 and 
                signal.department not in result):
                result.append(signal.department)
        
        return result[:top_k]
        
    def build_department_graphs(self, documents: List[Document], dept_documents_override: Dict[str, List[Document]] = None) -> Dict[str, int]:
        """
        Xây dựng graph riêng cho từng phòng ban từ documents
        ENHANCED: Cũng build semantic embeddings cho từng department
        
        Args:
            documents: List of all documents
            dept_documents_override: Optional dict to override department document grouping
        
        Returns:
            Dict[department, node_count] - Thống kê số node mỗi phòng ban
        """
        logger.info("=" * 80)
        logger.info("🏢 BUILDING DEPARTMENT-SPECIFIC GRAPHS WITH SEMANTIC EMBEDDINGS")
        logger.info("=" * 80)

        # Use provided dept_documents or classify documents by department
        if dept_documents_override:
            dept_documents = dept_documents_override
            logger.info("🔄 Using provided department document grouping")
        else:
            # Phân loại documents theo phòng ban using full_path - chỉ lấy docs trong thư mục phòng ban
            dept_documents = {}
            for doc in documents:
                # Use full_path if available, fallback to source
                source_path = doc.metadata.get('full_path', doc.metadata.get('source', ''))
                
                # Skip documents without folder structure (root level files)
                if '/' not in source_path and '\\' not in source_path:
                    continue
                
                # Check if it's actually in a department folder, not just detected by keywords
                path_lower = source_path.lower().replace('\\', '/')
                folder_depth = doc.metadata.get('folder_depth', 0)
                
                # Skip if folder_depth is 0 (root level files like "Giao trinh _ Phần mềm mã nguồn mở.md")
                if folder_depth == 0:
                    continue
                
                dept = self.detect_department_from_path(source_path)
                
                # Skip document_graph (general documents without specific department folder)
                if dept == 'document_graph':
                    continue
                
                if dept not in dept_documents:
                    dept_documents[dept] = []
                dept_documents[dept].append(doc)
                dept_documents[dept] = []
            dept_documents[dept].append(doc)
        
        # Thống kê
        logger.info(f"📊 Documents by department:")
        for dept, docs in dept_documents.items():
            logger.info(f"   {dept}: {len(docs)} documents")
        
        # Build semantic embeddings for departments
        logger.info("\n🧠 Building semantic embeddings for departments...")
        try:
            self.semantic_detector.build_department_embeddings(dept_documents)
            logger.info("✅ Semantic embeddings built successfully")
        except Exception as e:
            logger.warning(f"⚠️ Could not build semantic embeddings: {e}")
            logger.info("Will continue with keyword-based detection")
        
        # Xây dựng graph cho từng phòng ban
        stats = {}
        os.makedirs(self.base_output_dir, exist_ok=True)
        
        for dept, docs in dept_documents.items():
            if len(docs) == 0:
                logger.warning(f"⚠️  Skipping {dept}: No documents")
                continue
                
            logger.info(f"\n🏗️  Building graph for {dept}...")
            
            try:
                # Create department-specific output directory
                dept_output_dir = os.path.join(self.base_output_dir, f"{dept}_graph")
                os.makedirs(dept_output_dir, exist_ok=True)
                
                # Build graph cho department này
                graph_builder = DocumentGraph(
                    semantic_threshold=0.7,
                    max_semantic_edges_per_node=7
                )
                
                # Build the graph
                graph = graph_builder.build_graph(docs)
                
                # Save the graph
                graph_path = os.path.join(dept_output_dir, f"{dept}_graph.pkl")
                graph_builder.save_graph(graph_path)
                
                # Lưu graph và tạo partitioner/retriever
                self.department_graphs[dept] = graph_builder
                
                # Create subgraph partitioner
                partitioner = SubgraphPartitioner(graph)
                
                # Run community detection with summary generation (build mode)
                logger.info(f"🏘️ Running community detection for {dept}...")
                partitioner.partition_by_community_detection(generate_summaries=True)
                logger.info(f"   ✅ Detected {len(partitioner.communities)} communities")
                
                self.department_partitioners[dept] = partitioner
                
                # Create retriever với advanced parameters
                retriever = GraphRoutedRetriever(
                    graph=graph,
                    partitioner=partitioner,
                    embeddings_model=None,
                    k=10,  # FINAL: Top-10 sent to LLM (balance context size)
                    internal_k=30,  # INTERNAL: Expand from 30*2.5=75 candidates
                    hop_depth=3,  # Moderate hop depth for good coverage
                    expansion_factor=2.5  # Balanced expansion
                )
                self.department_retrievers[dept] = retriever
                
                # Stats
                if hasattr(graph_builder, 'graph') and graph_builder.graph:
                    node_count = len(graph_builder.graph.nodes())
                    edge_count = len(graph_builder.graph.edges())
                    stats[dept] = node_count
                    
                    logger.info(f"   ✅ {dept}: {node_count} nodes, {edge_count} edges")
                else:
                    stats[dept] = 0
                    logger.warning(f"   ⚠️  {dept}: No graph created")
                    
            except Exception as e:
                logger.error(f"   ❌ Error building graph for {dept}: {e}")
                stats[dept] = 0
        
        logger.info("\n" + "=" * 80)
        logger.info("✅ DEPARTMENT GRAPHS BUILD COMPLETED")
        logger.info("=" * 80)
        
        total_nodes = sum(stats.values())
        logger.info(f"📊 SUMMARY:")
        for dept, count in stats.items():
            percentage = (count / total_nodes * 100) if total_nodes > 0 else 0
            logger.info(f"   📁 {dept}: {count} nodes ({percentage:.1f}%)")
        
        logger.info(f"\n🎯 NEXT STEPS:")
        logger.info(f"   • Test queries with: query_smart() method")
        logger.info(f"   • Use user metadata for department routing")
        logger.info(f"   • Semantic similarity will resolve conflicts automatically")
        
        return stats
    
    def load_existing_graphs(self) -> bool:
        """
        Load các graph đã build trước đó
        """
        if not os.path.exists(self.base_output_dir):
            logger.warning(f"Department graphs directory not found: {self.base_output_dir}")
            return False
        
        loaded_count = 0
        
        # Special handling for document_graph at root level
        document_graph_dir = "document_graph"
        if os.path.exists(document_graph_dir) and os.path.isdir(document_graph_dir):
            try:
                # Look for graph files in document_graph directory
                graph_path = None
                for file in os.listdir(document_graph_dir):
                    if file.endswith('.graphml') or file.endswith('.pkl'):
                        graph_path = os.path.join(document_graph_dir, file)
                        break
                
                if graph_path and os.path.exists(graph_path):
                    # Load the graph from file
                    graph_builder = DocumentGraph()
                    graph_builder.load_graph(graph_path)
                    graph = graph_builder.graph
                    
                    # Create partitioner and retriever
                    partitioner = SubgraphPartitioner(graph)
                    
                    # Run community detection without summary generation (load mode)
                    logger.info(f"🏘️ Loading community detection for document_graph...")
                    partitioner.partition_by_community_detection(generate_summaries=False)
                    logger.info(f"   ✅ Loaded {len(partitioner.communities)} communities")
                    
                    retriever = GraphRoutedRetriever(
                        graph=graph,
                        partitioner=partitioner,
                        embeddings_model=None,
                        k=10,
                        internal_k=30,
                        hop_depth=3,
                        expansion_factor=2.5
                    )
                    
                    self.department_graphs['document_graph'] = graph_builder
                    self.department_partitioners['document_graph'] = partitioner
                    self.department_retrievers['document_graph'] = retriever
                    loaded_count += 1
                    
                    logger.info(f"✅ Loaded graph for document_graph")
                
            except Exception as e:
                logger.error(f"❌ Error loading document_graph: {e}")
        
        # Load regular department graphs from department_graphs directory
        for dept_name in os.listdir(self.base_output_dir):
            dept_dir = os.path.join(self.base_output_dir, dept_name)
            
            # Skip non-directories and embedding directory
            if not os.path.isdir(dept_dir) or dept_name == "embeddings":
                continue
            
            # Extract department name from directory name
            if dept_name.endswith('_graph'):
                dept = dept_name[:-6]  # Remove '_graph' suffix
            else:
                dept = dept_name
            
            try:
                # Look for graph files
                graph_path = None
                for file in os.listdir(dept_dir):
                    if file.endswith('.graphml') or file.endswith('.pkl'):
                        graph_path = os.path.join(dept_dir, file)
                        break
                
                if graph_path and os.path.exists(graph_path):
                    # Load the graph from file
                    graph_builder = DocumentGraph()
                    graph_builder.load_graph(graph_path)
                    graph = graph_builder.graph
                    
                    # Create partitioner and retriever với advanced parameters
                    partitioner = SubgraphPartitioner(graph)
                    
                    # Run community detection without summary generation (load mode)
                    logger.info(f"🏘️ Loading community detection for {dept}...")
                    partitioner.partition_by_community_detection(generate_summaries=False)
                    logger.info(f"   ✅ Loaded {len(partitioner.communities)} communities")
                    
                    retriever = GraphRoutedRetriever(
                        graph=graph,
                        partitioner=partitioner,
                        embeddings_model=None,
                        k=10,  # FINAL: Top-10 sent to LLM (balance context size)
                        internal_k=30,  # INTERNAL: Expand from 30*2.5=75 candidates
                        hop_depth=3,  # Moderate hop depth for good coverage
                        expansion_factor=2.5  # Balanced expansion
                    )
                    
                    self.department_graphs[dept] = graph_builder
                    self.department_partitioners[dept] = partitioner
                    self.department_retrievers[dept] = retriever
                    loaded_count += 1
                    
                    logger.info(f"✅ Loaded graph for {dept}")
                
            except Exception as e:
                logger.error(f"❌ Error loading graph for {dept}: {e}")
        
        if loaded_count > 0:
            logger.info(f"✅ Successfully loaded {loaded_count} department graphs")
            return True
        else:
            logger.warning("❌ No department graphs could be loaded")
            return False
    
    def query_smart(
        self,
        query: str,
        user_metadata: Dict[str, Any] = None,
        k: int = 5
    ) -> Tuple[List[str], DepartmentDecision]:
        """
        Enhanced query method sử dụng semantic department detection
        
        Returns:
            Tuple[results, department_decision]
        """
        logger.info(f"🧠 SMART QUERY with semantic routing")
        
        # Step 1: Detect department using dual-signal approach
        decision = self.detect_department_smart(query, user_metadata)
        
        # Step 2: Check permission
        if not decision.permission_granted:
            logger.warning(f"🚫 Access denied to {decision.chosen_department}")
            return [
                f"Xin lỗi, bạn không có quyền truy cập thông tin của phòng {decision.chosen_department}. "
                "Vui lòng liên hệ quản trị viên để được cấp quyền."
            ], decision
        
        # Step 3: Query trong department graph
        target_dept = decision.chosen_department
        logger.info(f"🗂️ USING GRAPH: {target_dept.upper()} (confidence: {decision.confidence:.3f})")
        
        if target_dept not in self.department_retrievers:
            logger.warning(f"⚠️ No retriever for department {target_dept}, trying to load...")
            
            if not self.load_existing_graphs():
                return [
                    f"Xin lỗi, không tìm thấy cơ sở dữ liệu cho phòng {target_dept}. "
                    "Vui lòng liên hệ quản trị viên."
                ], decision
        
        try:
            retriever = self.department_retrievers[target_dept]
            results = retriever._get_relevant_documents(query)
            
            logger.info(f"✅ Retrieved {len(results)} results from {target_dept}")
            
            return [doc.page_content for doc in results[:k]], decision
            
        except Exception as e:
            logger.error(f"❌ Error querying {target_dept}: {e}")
            
            # Fallback: try document_graph department
            if target_dept != 'document_graph' and 'document_graph' in self.department_retrievers:
                logger.info("🔄 Fallback to document_graph department")
                logger.info(f"🗂️ USING GRAPH: DOCUMENT_GRAPH (fallback from {target_dept.upper()})")
                try:
                    retriever = self.department_retrievers['document_graph']
                    results = retriever._get_relevant_documents(query)
                    return [doc.page_content for doc in results[:k]], decision
                except Exception as e2:
                    logger.error(f"❌ Fallback also failed: {e2}")
            
            return [
                f"Xin lỗi, đã xảy ra lỗi khi tìm kiếm thông tin: {str(e)}"
            ], decision
    
    def query_cross_department(
        self,
        query: str,
        user_metadata: Dict[str, Any] = None,
        departments: List[str] = None,
        k: int = 5
    ) -> Tuple[List[str], List[str]]:
        """
        Query across multiple departments (for admin users)
        
        Returns:
            Tuple[results, searched_departments]
        """
        if departments is None:
            departments = list(self.department_retrievers.keys())
        
        # Check admin permission
        user_role = user_metadata.get('role', 'student') if user_metadata else 'student'
        if user_role.lower() != 'admin':
            logger.warning(f"🚫 Cross-department query denied for role: {user_role}")
            return [
                "Bạn không có quyền tìm kiếm trên nhiều phòng ban. "
                "Chức năng này chỉ dành cho quản trị viên."
            ], []
        
        all_results = []
        searched_departments = []
        
        for dept in departments:
            if dept in self.department_retrievers:
                logger.info(f"🗂️ USING GRAPH: {dept.upper()}")
                try:
                    retriever = self.department_retrievers[dept]
                    dept_results = retriever._get_relevant_documents(query)
                    
                    # Add department prefix to results
                    prefixed_results = [
                        f"[{dept.upper()}] {doc.page_content}" for doc in dept_results
                    ]
                    
                    all_results.extend(prefixed_results)
                    searched_departments.append(dept)
                    
                except Exception as e:
                    logger.error(f"❌ Error querying {dept}: {e}")
        
        return all_results[:k], searched_departments
    
    def get_department_stats(self) -> Dict[str, Dict[str, Any]]:
        """
        Lấy thống kê các department graphs
        """
        stats = {}
        
        for dept, retriever in self.department_retrievers.items():
            try:
                # Basic stats
                dept_stats = {
                    'available': True,
                    'has_semantic_embeddings': dept in self.semantic_detector.department_embeddings
                }
                
                # Try to get graph stats
                if hasattr(retriever, 'partitioner') and retriever.partitioner:
                    if hasattr(retriever.partitioner, 'graph'):
                        graph = retriever.partitioner.graph
                        # Calculate communities correctly
                        num_communities = len(retriever.partitioner.communities) if hasattr(retriever.partitioner, 'communities') else 0
                        dept_stats.update({
                            'nodes': len(graph.nodes()) if graph else 0,
                            'edges': len(graph.edges()) if graph else 0,
                            'communities': num_communities
                        })
                
                stats[dept] = dept_stats
                
            except Exception as e:
                stats[dept] = {
                    'available': False,
                    'error': str(e)
                }
        
        return stats