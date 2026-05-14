"""Tutor-specific API endpoints."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import aio_pika
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.backend.services.tutor_knowledge_storage_service import (
    tutor_knowledge_storage_service,
)
from src.backend.services.tutor_dataset_import_service import (
    tutor_dataset_import_service,
)
from src.backend.services.tutor_storage_service import tutor_storage_service
from src.genai_tutor.knowledge_base.knowledge_file_worker import (
    tutor_knowledge_file_worker,
)
from src.genai_tutor.knowledge_base.ingestion_pipeline import (
    tutor_ingestion_pipeline,
)

logger = logging.getLogger(__name__)

router = APIRouter()


camel_model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class TutorIngestRequest(BaseModel):
    model_config = camel_model_config

    source_path: str = Field(..., description='Folder or file path under allowed data-source root')
    course_code: str = Field(..., min_length=2, max_length=50)
    language: str | None = Field(default=None, description='Target language such as c or python')
    topic: str | None = Field(default=None, max_length=100)
    difficulty: Literal['basic', 'intermediate', 'advanced'] | None = None
    reindex_mode: Literal['incremental', 'full', 'graph-only', 'embedding-only'] = Field(
        default='incremental',
        alias='reindexMode',
    )
    license_tag: str | None = Field(default=None, max_length=100)
    dry_run: bool = False
    triggered_by: str = Field(default='api', max_length=100)


class TutorIngestAcceptedResponse(BaseModel):
    model_config = camel_model_config

    job_id: str
    status: str
    dataset_version: str
    message: str


class TutorKnowledgeFileCreateRequest(BaseModel):
    model_config = camel_model_config

    file_id: str
    user_id: str
    filename: str
    description: str | None = None
    url: str
    key_r2: str
    mime_type: str
    size: int
    folder_id: str | None = None
    folder_name: str | None = None
    folder_description: str | None = None
    course_code: str | None = None
    language: str | None = None
    topic: str | None = None
    difficulty: Literal['basic', 'intermediate', 'advanced'] | None = None


class TutorKnowledgeFolderRequest(BaseModel):
    model_config = camel_model_config

    folder_id: str
    user_id: str
    name: str
    description: str | None = None
    icon: str


class TutorKnowledgeBulkRequest(BaseModel):
    model_config = camel_model_config

    file_ids: list[str]


class TutorKnowledgeFileResponse(BaseModel):
    model_config = camel_model_config

    file_id: str
    status: str
    progress: int
    chunk_count: int
    vector_count: int
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    url: str


class TutorDatasetImportRequest(BaseModel):
    model_config = camel_model_config

    user_id: str
    folder_id: str | None = None
    dataset_key: str


class TutorDatasetImportResponse(BaseModel):
    model_config = camel_model_config

    job_id: str
    dataset_key: str
    status: str
    progress: int
    stage: str
    message: str | None = None


@router.post('/ingest', response_model=TutorIngestAcceptedResponse)
async def create_tutor_ingest_job(request: TutorIngestRequest) -> TutorIngestAcceptedResponse:
    try:
        if '..' in request.source_path:
            raise HTTPException(status_code=400, detail='sourcePath không hợp lệ')

        job = await tutor_ingestion_pipeline.create_job(
            source_path=request.source_path,
            triggered_by=request.triggered_by,
            course_code=request.course_code,
            language=request.language,
            topic=request.topic,
            difficulty=request.difficulty,
            reindex_mode=request.reindex_mode,
            license_tag=request.license_tag,
            dry_run=request.dry_run,
        )
        return TutorIngestAcceptedResponse(
            job_id=job.job_id,
            status=job.status,
            dataset_version=job.dataset_version,
            message='Tutor ingestion job created successfully',
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error('Failed to create tutor ingest job: %s', exc)
        raise HTTPException(status_code=500, detail='Failed to create tutor ingest job') from exc


@router.post('/knowledge-files', response_model=TutorKnowledgeFileResponse)
async def create_tutor_knowledge_file(
    request: TutorKnowledgeFileCreateRequest,
) -> TutorKnowledgeFileResponse:
    try:
        payload = {
            'fileId': request.file_id,
            'userId': request.user_id,
            'filename': request.filename,
            'description': request.description,
            'url': request.url,
            'keyR2': request.key_r2,
            'mimeType': request.mime_type,
            'size': request.size,
            'status': 'PENDING',
            'progress': 0,
            'folderId': request.folder_id,
            'folderName': request.folder_name,
            'folderDescription': request.folder_description,
            'courseCode': request.course_code,
            'language': request.language,
            'topic': request.topic,
            'difficulty': request.difficulty,
            'sourceType': Path(request.filename).suffix.lower().lstrip('.'),
            'chunkCount': 0,
            'vectorCount': 0,
            'embeddingModel': None,
            'errorMessage': None,
            'metadata': {},
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'updatedAt': datetime.now(timezone.utc).isoformat(),
            'completedAt': None,
        }
        await tutor_knowledge_storage_service.create_file(payload)
        rabbitmq_url = os.getenv('RABBITMQ_URL')
        if rabbitmq_url:
            connection = await aio_pika.connect_robust(rabbitmq_url)
            async with connection:
                channel = await connection.channel()
                exchange = await channel.declare_exchange(
                    'examio.events',
                    aio_pika.ExchangeType.TOPIC,
                    durable=True,
                )
                event = {
                    'type': 'tutor.knowledge.requested',
                    'timestamp': int(datetime.now(timezone.utc).timestamp() * 1000),
                    'payload': payload,
                    'metadata': {'sourceService': 'ai-service'},
                }
                await exchange.publish(
                    aio_pika.Message(body=json.dumps(event).encode()),
                    routing_key='ai.tutor.knowledge.requested',
                )
        else:
            tutor_knowledge_file_worker.enqueue(payload)
        return TutorKnowledgeFileResponse(
            file_id=request.file_id,
            status='PENDING',
            progress=0,
            chunk_count=0,
            vector_count=0,
            error_message=None,
            metadata={
                'stage': 'queued',
                'graphStage': 'queued',
                'sourceType': Path(request.filename).suffix.lower().lstrip('.'),
            },
            url=request.url,
        )
    except Exception as exc:
        logger.error('Failed to create tutor knowledge file job: %s', exc)
        raise HTTPException(status_code=500, detail='Failed to create tutor knowledge file job') from exc


@router.get('/dataset-imports/catalog', response_model=list[dict[str, Any]])
async def list_tutor_dataset_catalog() -> list[dict[str, Any]]:
    return tutor_dataset_import_service.list_catalog()


@router.post('/dataset-imports', response_model=TutorDatasetImportResponse)
async def create_tutor_dataset_import(
    request: TutorDatasetImportRequest,
) -> TutorDatasetImportResponse:
    try:
        job = await tutor_dataset_import_service.create_job(
            user_id=request.user_id,
            folder_id=request.folder_id,
            dataset_key=request.dataset_key,
        )
        return TutorDatasetImportResponse(
            job_id=job['jobId'],
            dataset_key=job['datasetKey'],
            status=job['status'],
            progress=job['progress'],
            stage=job['stage'],
            message=job.get('message'),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error('Failed to create dataset import job: %s', exc)
        raise HTTPException(status_code=500, detail='Failed to create dataset import job') from exc


@router.get('/dataset-imports', response_model=list[dict[str, Any]])
async def list_tutor_dataset_import_jobs(user_id: str) -> list[dict[str, Any]]:
    return await tutor_dataset_import_service.list_jobs(user_id)


@router.get('/dataset-imports/states', response_model=list[dict[str, Any]])
async def list_tutor_dataset_import_states(user_id: str) -> list[dict[str, Any]]:
    return await tutor_dataset_import_service.list_dataset_states(user_id)


@router.get('/dataset-imports/{job_id}', response_model=dict[str, Any])
async def get_tutor_dataset_import_job(job_id: str) -> dict[str, Any]:
    job = await tutor_dataset_import_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail='Tutor dataset import job not found')
    return job


@router.post('/dataset-imports/{job_id}/cancel', response_model=dict[str, Any])
async def cancel_tutor_dataset_import_job(job_id: str) -> dict[str, Any]:
    try:
        return await tutor_dataset_import_service.cancel_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/dataset-imports/{dataset_key}/clear', response_model=dict[str, Any])
async def clear_tutor_dataset_import(
    dataset_key: str,
    user_id: str,
) -> dict[str, Any]:
    try:
        return await tutor_dataset_import_service.clear_dataset(
            user_id=user_id,
            dataset_key=dataset_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/knowledge-folders', response_model=dict[str, Any])
async def create_tutor_knowledge_folder(
    request: TutorKnowledgeFolderRequest,
) -> dict[str, Any]:
    payload = {
        'folderId': request.folder_id,
        'userId': request.user_id,
        'name': request.name,
        'description': request.description,
        'icon': request.icon,
        'metadata': {},
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'updatedAt': datetime.now(timezone.utc).isoformat(),
    }
    return await tutor_knowledge_storage_service.create_folder(payload)


@router.put('/knowledge-folders/{folder_id}', response_model=dict[str, Any])
async def update_tutor_knowledge_folder(
    folder_id: str,
    request: TutorKnowledgeFolderRequest,
) -> dict[str, Any]:
    payload = {
        'folderId': folder_id,
        'name': request.name,
        'description': request.description,
        'icon': request.icon,
        'metadata': {},
        'updatedAt': datetime.now(timezone.utc).isoformat(),
    }
    return await tutor_knowledge_storage_service.update_folder(payload)


@router.delete('/knowledge-folders/{folder_id}', response_model=dict[str, Any])
async def delete_tutor_knowledge_folder(folder_id: str) -> dict[str, Any]:
    deleted_files = await tutor_knowledge_storage_service.delete_folder(folder_id)
    logger.info(
        'Audit: deleted knowledge folder %s with %s files',
        folder_id,
        len(deleted_files),
    )
    return {'success': True, 'deletedFiles': deleted_files}


@router.get('/knowledge-folders', response_model=list[dict[str, Any]])
async def list_tutor_knowledge_folders(user_id: str) -> list[dict[str, Any]]:
    return await tutor_knowledge_storage_service.list_folders(user_id)


@router.get('/knowledge-stats', response_model=dict[str, Any])
async def get_tutor_knowledge_stats(
    user_id: str,
    folder_id: str | None = None,
) -> dict[str, Any]:
    return await tutor_knowledge_storage_service.get_stats(
        user_id,
        folder_id=folder_id,
    )


@router.get('/knowledge-folders/{folder_id}/contents', response_model=dict[str, Any])
async def get_tutor_knowledge_folder_contents(
    folder_id: str,
    user_id: str,
    page: int = 1,
    page_size: int = 12,
) -> dict[str, Any]:
    folder = await tutor_knowledge_storage_service.get_folder(folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail='Tutor knowledge folder not found')
    files = await tutor_knowledge_storage_service.list_files(
        user_id,
        folder_id=folder_id,
        page=page,
        page_size=page_size,
    )
    return {'folder': folder, 'files': files}


@router.get('/knowledge-files/{file_id}', response_model=dict[str, Any])
async def get_tutor_knowledge_file(file_id: str) -> dict[str, Any]:
    record = await tutor_knowledge_storage_service.get_file(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail='Tutor knowledge file not found')
    return record


@router.get('/knowledge-files/{file_id}/graph', response_model=dict[str, Any])
async def get_tutor_knowledge_file_graph(file_id: str) -> dict[str, Any]:
    record = await tutor_knowledge_storage_service.get_file(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail='Tutor knowledge file not found')

    graph_document_id = record.get('graphDocumentId') or record['fileId']
    snapshot = await tutor_storage_service.get_graph_snapshot_by_document(graph_document_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail='Tutor graph snapshot not found for knowledge file')
    return snapshot


@router.get('/knowledge-files', response_model=dict[str, Any])
async def list_tutor_knowledge_files(
    user_id: str,
    folder_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    sort_by: str = 'createdAt',
    sort_order: str = 'desc',
    page: int = 1,
    page_size: int = 12,
) -> dict[str, Any]:
    return await tutor_knowledge_storage_service.list_files(
        user_id,
        folder_id=folder_id,
        status=status,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )


@router.delete('/knowledge-files/{file_id}', response_model=dict[str, Any])
async def delete_tutor_knowledge_file(file_id: str) -> dict[str, Any]:
    deleted = await tutor_knowledge_storage_service.delete_file(file_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail='Tutor knowledge file not found')
    logger.info('Audit: deleted knowledge file %s', file_id)
    return deleted


@router.post('/knowledge-files/{file_id}/reprocess', response_model=dict[str, Any])
async def reprocess_tutor_knowledge_file(file_id: str) -> dict[str, Any]:
    record = await tutor_knowledge_storage_service.get_file(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail='Tutor knowledge file not found')

    payload = {
        'fileId': record['fileId'],
        'userId': record['userId'],
        'filename': record['filename'],
        'description': record.get('description'),
        'url': record['url'],
        'keyR2': record['keyR2'],
        'mimeType': record['mimeType'],
        'size': record['size'],
        'status': 'PENDING',
        'progress': 0,
        'folderId': record.get('folderId'),
        'folderName': record.get('folderName'),
        'folderDescription': record.get('folderDescription'),
        'courseCode': record.get('courseCode'),
        'language': record.get('language'),
        'topic': record.get('topic'),
        'difficulty': record.get('difficulty'),
        'sourceType': record.get('sourceType'),
        'chunkCount': 0,
        'vectorCount': 0,
        'embeddingModel': None,
        'errorMessage': None,
        'metadata': {'stage': 'queued', 'message': 'Đang chờ xử lý lại'},
        'updatedAt': datetime.now(timezone.utc).isoformat(),
        'completedAt': None,
    }
    await tutor_knowledge_storage_service.update_file(payload)
    rabbitmq_url = os.getenv('RABBITMQ_URL')
    if rabbitmq_url:
        connection = await aio_pika.connect_robust(rabbitmq_url)
        async with connection:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                'examio.events',
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
            event = {
                'type': 'tutor.knowledge.requested',
                'timestamp': int(datetime.now(timezone.utc).timestamp() * 1000),
                'payload': payload,
                'metadata': {'sourceService': 'ai-service', 'mode': 'reprocess'},
            }
            await exchange.publish(
                aio_pika.Message(body=json.dumps(event).encode()),
                routing_key='ai.tutor.knowledge.requested',
            )
    else:
        tutor_knowledge_file_worker.enqueue(payload)
    logger.info('Audit: reprocess requested for knowledge file %s', file_id)
    return {'success': True, 'fileId': file_id, 'status': 'PENDING'}


@router.post('/knowledge-files/bulk-delete', response_model=dict[str, Any])
async def bulk_delete_tutor_knowledge_files(request: TutorKnowledgeBulkRequest) -> dict[str, Any]:
    deleted_files: list[dict[str, Any]] = []
    for file_id in request.file_ids:
        deleted = await tutor_knowledge_storage_service.delete_file(file_id)
        if deleted is not None:
            deleted_files.append(deleted)
    logger.info('Audit: bulk deleted %s knowledge files', len(deleted_files))
    return {'success': True, 'deletedFiles': deleted_files}


@router.post('/knowledge-files/bulk-reprocess', response_model=dict[str, Any])
async def bulk_reprocess_tutor_knowledge_files(request: TutorKnowledgeBulkRequest) -> dict[str, Any]:
    queued_ids: list[str] = []
    for file_id in request.file_ids:
        result = await reprocess_tutor_knowledge_file(file_id)
        if result.get('success'):
            queued_ids.append(file_id)
    logger.info('Audit: bulk reprocess requested for %s knowledge files', len(queued_ids))
    return {'success': True, 'queuedFileIds': queued_ids}


@router.get('/ingest/{job_id}', response_model=dict[str, Any])
async def get_tutor_ingest_job(job_id: str) -> dict[str, Any]:
    job = await tutor_ingestion_pipeline.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail='Tutor ingest job not found')
    return job.to_dict()


@router.get('/ingest', response_model=list[dict[str, Any]])
async def list_tutor_ingest_jobs() -> list[dict[str, Any]]:
    jobs = await tutor_ingestion_pipeline.list_jobs()
    return [job.to_dict() for job in jobs[:20]]


@router.get('/graph/job/{job_id}', response_model=dict[str, Any])
async def get_tutor_graph_by_job(job_id: str) -> dict[str, Any]:
    snapshot = await tutor_storage_service.get_graph_snapshot_by_job(job_id)
    if not snapshot.get('documents'):
        raise HTTPException(status_code=404, detail='Tutor graph snapshot not found for job')
    return snapshot


@router.get('/graph/document/{document_id}', response_model=dict[str, Any])
async def get_tutor_graph_by_document(document_id: str) -> dict[str, Any]:
    snapshot = await tutor_storage_service.get_graph_snapshot_by_document(document_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail='Tutor graph snapshot not found for document')
    return snapshot


@router.get('/health', response_model=dict[str, Any])
async def tutor_health_check() -> dict[str, Any]:
    return await tutor_ingestion_pipeline.get_health()
