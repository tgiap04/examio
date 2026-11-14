"""
KMA Regulations Assistant - retrieval helpers (chunking, vector store, metadata filters).
"""

from .table_aware_chunking import load_documents_from_folder

__version__ = "0.3.0"
__all__ = ["load_documents_from_folder"]
