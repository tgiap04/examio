import { Controller } from '@nestjs/common';
import { subscriptionV1 } from '@examio/contracts';
import { SubscriptionService } from './subscription.service';

@Controller()
@subscriptionV1.SubscriptionServiceControllerMethods()
export class SubscriptionGrpcController
    implements subscriptionV1.SubscriptionServiceController
{
    constructor(private readonly subscriptionService: SubscriptionService) {}

    async getUserBenefits(
        data: subscriptionV1.GetUserBenefitsRequest
    ): Promise<subscriptionV1.GetUserBenefitsResponse> {
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
