import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

// Cấu hình Pomodoro dùng chung cho create/update.
const PomodoroConfigSchema = {
    workMinutes: z.number().int().min(1).max(180).optional(),
    breakMinutes: z.number().int().min(1).max(60).optional(),
    longBreakMinutes: z.number().int().min(1).max(60).optional(),
    cyclesBeforeLongBreak: z.number().int().min(1).max(12).optional(),
    maxParticipants: z.number().int().min(2).max(20).optional(),
};

export const CreateStudyRoomSchema = z.object({
    name: z.string().min(1, { message: 'Tên phòng không được để trống' }).max(100),
    description: z.string().max(500).optional(),
    ...PomodoroConfigSchema,
});

export class CreateStudyRoomDto extends createZodDto(CreateStudyRoomSchema) {
    @ApiProperty({ example: 'Phòng ôn thi cuối kỳ' })
    name: string;

    @ApiProperty({ required: false })
    description?: string;
}

export const UpdateStudyRoomSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
    ...PomodoroConfigSchema,
});

export class UpdateStudyRoomDto extends createZodDto(UpdateStudyRoomSchema) {}

export const JoinByCodeSchema = z.object({
    inviteCode: z
        .string()
        .regex(/^\d{6}$/, { message: 'Mã mời phải gồm 6 chữ số' }),
});

export class JoinByCodeDto extends createZodDto(JoinByCodeSchema) {
    @ApiProperty({ example: '123456' })
    inviteCode: string;
}
