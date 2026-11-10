import { HttpException } from '@nestjs/common';
import { grpcErrorToHttpException, isGrpcUnavailable } from '@examio/grpc';

/** content-service answered too slowly or not at all: the teacher may retry, nothing was written. */
export const contentUnavailable = (): HttpException =>
    new HttpException(
        {
            statusCode: 503,
            code: 'CONTENT_UNAVAILABLE',
            message: 'Dịch vụ bộ đề tạm thời không khả dụng, vui lòng thử lại sau',
        },
        503
    );

/** An outage reads `CONTENT_UNAVAILABLE`; everything else keeps the shared gRPC -> HTTP mapping. */
export function toContentHttpException(error: unknown): HttpException {
    if (isGrpcUnavailable(error)) return contentUnavailable();
    return grpcErrorToHttpException(error);
}
