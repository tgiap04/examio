import { Controller } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { subscriptionV1 } from '@examio/contracts';
import { SubscriptionService } from './subscription.service';
import { RequirePermissionsOrService, assertSelfOrService } from '@examio/auth-jwt';

@Controller()
@subscriptionV1.SubscriptionServiceControllerMethods()
export class SubscriptionGrpcController
    implements subscriptionV1.SubscriptionServiceController
{
    constructor(private readonly subscriptionService: SubscriptionService) {}

    @RequirePermissionsOrService([])
    async getUserBenefits(
        data: subscriptionV1.GetUserBenefitsRequest,
        metadata: Metadata
    ): Promise<subscriptionV1.GetUserBenefitsResponse> {
        // A user token may only read its OWN benefits; allowlisted services any.
        assertSelfOrService(metadata, data.userId);
        const benefits =
            await this.subscriptionService.getUserSubscriptionBenefits(
                data.userId
            );

        // Map benefits back to tier ID for proto
        let tier = 0;
        if (benefits.name === 'Basic') tier = 1;
        if (benefits.name === 'Advanced') tier = 2;
        if (benefits.name === 'VIP') tier = 3;

        return {
            tier,
            tierName: benefits.nameVi,
            filesPerMonth: benefits.filesPerMonth,
            messagesPerMinute: benefits.messagesPerMinute,
            chatMessagesLimit: benefits.chatMessagesLimit,
        };
    }
}
